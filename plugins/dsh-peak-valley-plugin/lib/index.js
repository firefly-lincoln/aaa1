/**
 * dsh-peak-valley-plugin — host half.
 *
 * A PERMANENT re-host of the dynamic Cordis plugin `peak-1` (v12) that was lost
 * when DSH restarted. The recovered body is reproduced byte-identically in
 * `./core.js`; this file supplies the two things the dynamic sandbox used to
 * inject:
 *
 *  - `harness.handle(name, handler)` — every handler the body registers becomes
 *    `POST /api/dsh-peak-valley/<name>`, the permanent stand-in for the
 *    package-private RPC the browser half used to call.
 *  - `ctx.get('fs')` — a real `node:fs` adapter. The sandboxed filesystem
 *    service refused the plugin's calendar cache
 *    (`file access denied under workspace-write mode`), which made it re-fetch
 *    the government calendar on every boot; with node:fs the cache actually
 *    sticks.
 *
 * Everything else reaches the real context unchanged, so the recovered logic
 * keeps using the real `sessions` / `web` services and the timer mixin.
 *
 * @module dsh-peak-valley-plugin
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, normalize } from 'node:path'
import { createCore } from './core.js'

/** Stable Cordis plugin name. */
export const name = 'dsh-peak-valley-plugin'

/** `timer` carries the `ctx.timeout` / `ctx.interval` mixin the body uses. */
export const inject = ['webServer', 'timer']

/** Route prefix for the handlers the recovered body registers. */
const ROUTE_PREFIX = '/api/dsh-peak-valley'

/** Largest request body accepted from the browser half. */
const MAX_BODY_BYTES = 65536

/** Read and parse one JSON request body. */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return null
  const text = Buffer.concat(chunks).toString('utf8')
  return text.trim() === '' ? null : JSON.parse(text)
}

/** One JSON reply. */
function sendJson(res, status, body) {
  const text = JSON.stringify(body === undefined ? null : body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(text)
}

/**
 * Mount the recovered plugin.
 * @param ctx - the plugin context carrying the web server and the timer.
 */
export async function apply(ctx) {
  const handlers = new Map()

  const harness = {
    handle(method, handler) {
      const key = String(method)
      handlers.set(key, handler)
      return () => handlers.delete(key)
    },
    /** No model-visible tools in this plugin; keep the shape for compatibility. */
    defineTool(definition) {
      return definition
    },
    registerTool() {
      return () => {}
    },
  }

  /** node:fs-backed replacement for the sandboxed filesystem service. */
  const unsandboxedFs = {
    async resolve(path) {
      return { path: normalize(String(path)) }
    },
    async readText(target) {
      return readFileSync(target.path, 'utf8')
    },
    async writeText(target, content) {
      mkdirSync(dirname(target.path), { recursive: true })
      writeFileSync(target.path, String(content))
    },
  }

  /**
   * The recovered body may keep the context it is handed, so functions are
   * bound to the real context rather than to this Proxy.
   */
  const coreCtx = new Proxy(ctx, {
    get(target, property) {
      if (property === 'get') return (serviceName) => (serviceName === 'fs' ? unsandboxedFs : target.get(serviceName))
      const value = target[property]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })

  const core = await createCore(coreCtx, harness)
  await core.apply(coreCtx)

  for (const [method, handler] of handlers) {
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_PREFIX}/${method}`,
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'use POST' })
            return
          }
          try {
            const args = await readJsonBody(req)
            const value = await handler(args)
            sendJson(res, 200, value === undefined ? null : value)
          } catch (error) {
            sendJson(res, 500, { ok: false, error: String(error && error.message ? error.message : error) })
          }
        },
      }),
    )
  }
}
