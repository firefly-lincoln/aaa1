/**
 * dsh-context-budget-plugin — 宿主半边（常驻版）。
 *
 * 这是动态 Cordis 插件 `ctxbud-2`（v9 / pkg-12）的**常驻化重宿主**。动态版只活在
 * 进程内存里，DSH 一重启就没了；常驻版由 profile 在启动时自动加载，所以能一直用。
 *
 * 做法：`./core.js` 里逐字保留动态版的 body（由 `../build.mjs` 生成），
 * 本文件只补上沙箱当年注入的两样东西：
 *
 *  - `harness.handle(name, handler)` —— body 注册的每个处理器变成
 *    `POST /api/dsh-context-budget/<name>`，也就是浏览器半边原来调用的那个
 *    包内 RPC 的常驻替身。
 *  - `ctx.get('fs')` —— 真 `node:fs` 适配器。沙箱版受 workspace-write 策略限制，
 *    而常驻版直接落盘；本插件要写的「经验教训」文档本来就在工作区内，两种都能写，
 *    但用 node:fs 更直接、没有策略层。
 *
 * 其余服务（`sessions` / `tokenMeter` / `sessionProjections` / `agents`）原样透传，
 * 所以 body 里的测量与事件逻辑一行未改。
 *
 * ⚠️ 两点与动态版的行为差异，见 ../README.md 的「常驻版改了什么」：
 *  1. 没有 `cordis_run` 卡片，所以归属锚点不会渲染；会话头部浮标的上报成为唯一线索。
 *  2. 因此宿主接受非归属绑定 —— 显示早已按会话隔离，每个会话各自一份文档。
 *
 * @module dsh-context-budget-plugin
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, normalize } from 'node:path'
import { createCore } from './core.js'

/** 稳定的 Cordis 插件名。 */
export const name = 'dsh-context-budget-plugin'

/** `timer` 提供 body 用到的 `ctx.timeout` / `ctx.interval` 混入。 */
export const inject = ['webServer', 'timer']

/** body 注册的处理器对应的路由前缀。 */
const ROUTE_PREFIX = '/api/dsh-context-budget'

/** 浏览器半边请求体的最大字节数。 */
const MAX_BODY_BYTES = 65536

/** 读取并解析一个 JSON 请求体。 */
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

/** 回一个 JSON 响应。 */
function sendJson(res, status, body) {
  const text = JSON.stringify(body === undefined ? null : body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(text)
}

/**
 * 挂载常驻版。
 * @param ctx - 带 webServer 与 timer 的插件上下文。
 */
export async function apply(ctx) {
  const handlers = new Map()

  const harness = {
    handle(method, handler) {
      const key = String(method)
      handlers.set(key, handler)
      return () => handlers.delete(key)
    },
    /** 本插件不注册模型可见工具（工具 schema 会进每一轮提示词）。保留形状仅为兼容。 */
    defineTool(definition) {
      return definition
    },
    registerTool() {
      return () => {}
    },
  }

  /** 取代沙箱文件系统的 node:fs 版本。body 只用到 resolve + writeText。 */
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
   * body 会长期持有这个 ctx，所以函数一律绑到真实 ctx 上，而不是绑到 Proxy。
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

  // 启动自检：DSH 启动日志里能看到这一行，说明宿主半边真的加载了。
  ctx.logger?.info?.(`[${name}] 已加载；路由 ${ROUTE_PREFIX}/<method>，共 ${handlers.size} 个处理器`)
}
