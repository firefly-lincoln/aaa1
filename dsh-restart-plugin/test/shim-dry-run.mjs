/**
 * Dry run for the restart helper, with no DSH involved.
 *
 * `dry-run-victim.cjs` plays the DSH process: it spawns the generated helper
 * detached and exits. The helper must (1) outlive it, (2) wait for its pid to
 * disappear, and (3) run the replacement command. The replacement appends one
 * line to a marker file, which this script checks.
 *
 * Run with: node test/shim-dry-run.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHIM_SOURCE } from '../lib/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(tmpdir(), 'dsh-restart-dryrun')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

const shim = join(dir, 'shim.mjs')
const log = join(dir, 'relaunch.log')
const marker = join(dir, 'marker.txt')
writeFileSync(shim, SHIM_SOURCE, 'utf8')

const victim = spawn(process.execPath, [join(here, 'dry-run-victim.cjs'), shim, log, marker], { stdio: 'inherit' })
await new Promise((resolve) => victim.on('exit', resolve))
console.log('victim exited; waiting for the helper to relaunch…')

await new Promise((resolve) => setTimeout(resolve, 5000))
const ok = existsSync(marker)
console.log(`marker exists: ${ok}`)
if (ok) console.log(readFileSync(marker, 'utf8').trim())
process.exit(ok ? 0 : 1)
