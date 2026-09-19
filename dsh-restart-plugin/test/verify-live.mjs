/** Verify the browser half is wired into the served page. Run: node test/verify-live.mjs */
const base = 'http://127.0.0.1:3080'

const index = await (await fetch(`${base}/`)).text()
const hits = [...index.matchAll(/[^"'\s>]*dsh-restart[^"'\s<]*/g)].map((m) => m[0])
console.log(`index mentions dsh-restart: ${hits.length}`)
for (const hit of hits.slice(0, 6)) console.log('  ', hit)

const status = await (await fetch(`${base}/api/dsh-restart/status`)).json()
console.log('status:', JSON.stringify(status))

const url = hits.find((h) => h.includes('.js'))
if (url === undefined) {
  console.log('RESULT: no bundle URL advertised in the index -> the browser half is NOT injected')
  process.exit(1)
}
const absolute = url.startsWith('http') ? url : base + (url.startsWith('/') ? '' : '/') + url
const response = await fetch(absolute)
const body = await response.text()
const registers = body.includes('__ModuleLoader__.load') && body.includes('dsh-restart-plugin')
console.log(`bundle ${absolute} -> HTTP ${response.status}, ${body.length} bytes, registers plugin: ${registers}`)
console.log(registers ? 'RESULT: browser half is served' : 'RESULT: bundle served but does not register the plugin')
process.exit(registers ? 0 : 1)
