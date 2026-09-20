/**
 * Stand-in for the DSH process in the shim dry run: it starts the generated
 * helper detached (exactly as the plugin does), then exits — the helper must
 * wait for this pid to disappear and only then start the replacement command.
 */
const { spawn } = require('node:child_process')

const [shim, log, marker] = process.argv.slice(2)
const replacement = "require('node:fs').appendFileSync(process.argv[1], 'relaunched ' + new Date().toISOString() + '\\n')"

const helper = spawn(
  process.execPath,
  [shim, String(process.pid), process.cwd(), log, process.execPath, '-e', replacement, marker],
  { detached: true, stdio: 'ignore', windowsHide: true },
)
helper.unref()

console.log(`victim pid ${process.pid} -> helper pid ${helper.pid}`)
setTimeout(() => process.exit(0), 700)
