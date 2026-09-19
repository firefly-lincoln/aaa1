/**
 * Regression test for the restart flow that broke once already:
 *
 *  1. the row mounts while DSH is DOWN → the button must stay usable (it used to
 *     disable itself forever after one failed status fetch);
 *  2. the retry picks the server up again;
 *  3. a click restarts, the poll sees a NEW boot id, and the page navigates to
 *     the same origin WITH THE NEW TOKEN (a stale token is what leaves the page
 *     rendering while every app-channel call fails).
 *
 * Run with: node test/restart-flow.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(here, '..', 'client', 'client.js'), 'utf8')

function node(tag) {
  const element = {
    tagName: tag, textContent: '', type: '', style: {}, children: [], parentNode: null, listeners: {},
    appendChild(child) { child.parentNode = element; element.children.push(child); return child },
    removeChild(child) { element.children = element.children.filter((c) => c !== child); child.parentNode = null },
    addEventListener(name, handler) { element.listeners[name] = handler },
  }
  return element
}

/** Scripted server: `up` gates availability, `boot`/`token` change on restart. */
const server = { up: false, boot: 'boot-1', token: 'tok-1', ready: true, restarted: false }
const log = []

globalThis.window = {
  __ModuleLoader__: { load: () => {} },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  location: {
    origin: 'http://127.0.0.1:3080',
    replace: (target) => log.push(`navigate ${target}`),
    reload: () => log.push('reload'),
  },
  fetch: (url, options) => {
    if (!server.up) return Promise.reject(new Error('ECONNREFUSED'))
    const method = (options && options.method) || 'GET'
    log.push(`${method} ${url}`)
    let body
    if (url.endsWith('/restart')) {
      server.restarted = true
      body = { ok: true, bootId: server.boot, scheduled: true }
    } else if (url.endsWith('/ping')) {
      body = { ok: true, bootId: server.boot, ready: server.ready, token: server.token }
    } else {
      body = { ok: true, bootId: server.boot, ready: true, token: server.token, command: 'node dsh.js web --no-open', logPath: 'C:\\log' }
    }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) })
  },
}
globalThis.document = { getElementById: () => null, createElement: (tag) => node(tag), head: node('head') }

const failures = []
const check = (label, condition) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}`)
  if (!condition) failures.push(label)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let registration
globalThis.window.__ModuleLoader__.load = (value) => { registration = value }
new Function('window', 'document', bundle)(globalThis.window, globalThis.document)

const api = registration.factory(() => { throw new Error('no requires') })
let host = null
const stubCtx = {
  slots: {
    inject: (slot, callback) => { callback(); return () => {} },
    register: (options, render) => {
      const element = render()
      host = node('div')
      element.ref(host)
      return () => element.ref(null)
    },
  },
}
api.apply(stubCtx)

const button = () => host.children[0].children[1]
const note = () => host.children[0].children[0].children[3]

// 1. Mounted while DSH is down: fetch rejects, but the row must stay usable.
await sleep(60)
check('button exists', button() !== undefined)
check('button is NOT disabled while the host is down', button().disabled === false)
check('row explains it is still connecting', /正在连接宿主插件/.test(note().textContent))

// 2. Server returns; the status retry must recover on its own.
server.up = true
await sleep(1700)
check('retry recovered and shows the launch command', /启动命令/.test(host.children[0].children[0].children[2].textContent))
check('button label back to the action', button().textContent === '立即重启')

// 3. Click → restart → the new boot answers with a new token → navigate.
button().listeners.click()
await sleep(1400)
check('restart was requested', log.some((line) => line.startsWith('POST /api/dsh-restart/restart')))

server.boot = 'boot-2'
server.token = 'tok-2'
await sleep(1500)
check('page navigated back with the NEW token',
  log.includes('navigate http://127.0.0.1:3080/?token=tok-2'))

console.log(failures.length === 0 ? '\nRESULT: restart flow is correct' : `\nRESULT: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
