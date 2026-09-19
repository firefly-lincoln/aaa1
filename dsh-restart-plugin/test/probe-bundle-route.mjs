/** Probe the client-module bundle route for our row and a known-good control. */
const base = 'http://127.0.0.1:3080'
const shapes = (id) => [
  `/plugins/${id}.js`,
  `/plugins/${id}.js?rev=0`,
  `/plugins/${id}`,
  `/plugins/@deepseek-ai/${id}.js`,
]

for (const id of ['dsh-restart-plugin', 'dsh-whale-pet-plugin']) {
  for (const path of shapes(id)) {
    let status = 'ERR'
    let note = ''
    try {
      const response = await fetch(base + path)
      status = response.status
      if (response.ok) {
        const body = await response.text()
        note = `${body.length} bytes, registers: ${body.includes('__ModuleLoader__.load')}`
      } else {
        note = (await response.text()).slice(0, 80).replace(/\s+/g, ' ')
      }
    } catch (error) {
      note = error.message
    }
    console.log(`${path} -> ${status} ${note}`)
  }
}
