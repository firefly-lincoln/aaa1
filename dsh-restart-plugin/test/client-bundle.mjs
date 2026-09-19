/**
 * Unit test for the browser half: load the bundle exactly the way the page's
 * module system does (`window.__ModuleLoader__.load`), assert the exported
 * plugin shape, then run `apply` against a stub slots service and mount the row
 * against a stub DOM. Catches a malformed bundle or a row that throws on mount
 * without needing a browser or a DSH restart.
 *
 * Run with: node test/client-bundle.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(here, '..', 'client', 'client.js'), 'utf8')

/** Minimal DOM node. */
function node(tag) {
  const element = {
    tagName: tag,
    className: '',
    textContent: '',
    type: '',
    id: '',
    style: {},
    children: [],
    parentNode: null,
    listeners: {},
    appendChild(child) {
      child.parentNode = element
      element.children.push(child)
      return child
    },
    removeChild(child) {
      element.children = element.children.filter((candidate) => candidate !== child)
      child.parentNode = null
    },
    addEventListener(name, handler) {
      element.listeners[name] = handler
    },
  }
  return element
}

const loads = []
const requests = []
globalThis.window = {
  __ModuleLoader__: { load: (registration) => loads.push(registration) },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  location: {
    origin: 'http://127.0.0.1:3080',
    reload: () => requests.push('reload'),
    replace: (target) => requests.push(`replace ${target}`),
  },
  fetch: (url, options) => {
    requests.push(`${(options && options.method) || 'GET'} ${url} creds=${(options && options.credentials) || 'default'}`)
    const body = url.endsWith('/status')
      ? { ok: true, bootId: 'boot-1', ready: true, token: 'tok-1', command: 'node dsh.js web --no-open', logPath: 'C:\\log' }
      : { ok: true, bootId: 'boot-1', ready: true, token: 'tok-1' }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) })
  },
}
globalThis.document = {
  getElementById: () => null,
  createElement: (tag) => node(tag),
  head: node('head'),
}

const failures = []
const check = (label, condition) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}`)
  if (!condition) failures.push(label)
}

// Execute the bundle: it must register itself, not run anything else.
// eslint-disable-next-line no-new-func
new Function('window', 'document', bundle)(globalThis.window, globalThis.document)

check('bundle registers exactly one factory', loads.length === 1)
const registration = loads[0]
check('registration id is the package name', registration && registration.id === 'dsh-restart-plugin')
check('factory is callable', registration && typeof registration.factory === 'function')

const api = registration.factory(() => {
  throw new Error('the browser half must not require a module')
})
check('exports apply', typeof api.apply === 'function')
check('exports inject = ["slots"]', JSON.stringify(api.inject) === '["slots"]')

// Run apply against a stub slots service.
const registered = []
const stubCtx = {
  slots: {
    inject: (slot, callback) => {
      registered.push(`inject:${slot}`)
      callback()
      return () => {}
    },
    register: (options, render) => {
      registered.push(`register:${options.name}:${options.id}`)
      const element = render()
      check('render returns a react element stub', element && element.$$typeof === Symbol.for('react.element'))
      const host = node('div')
      element.ref(host)
      check('row mounts a button', host.children[0] && host.children[0].children.length === 2)
      const button = host.children[0].children[1]
      check('button label', button.textContent === '立即重启')
      check('button has a click handler', typeof button.listeners.click === 'function')
      element.ref(null)
      return () => {}
    },
  },
}
api.apply(stubCtx)
check('registers into settings.general.item', registered.includes('register:settings.general.item:dsh-restart'))
check('waits for the slot declaration', registered.includes('inject:settings.general.item'))
check('reads plugin status on mount', requests.some((request) => request.includes('/api/dsh-restart/status')))

console.log(failures.length === 0 ? '\nRESULT: browser half is valid' : `\nRESULT: ${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)
