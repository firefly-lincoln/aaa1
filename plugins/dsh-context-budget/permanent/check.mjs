#!/usr/bin/env node
// 常驻包自检：真实 import 宿主半边（会解析并执行模块顶层代码）+ 解析客户端 bundle +
// 结构断言 + 常驻版改动断言。用法：node permanent/check.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const core = readFileSync(join(HERE, 'lib', 'core.js'), 'utf8')
const index = readFileSync(join(HERE, 'lib', 'index.js'), 'utf8')
const client = readFileSync(join(HERE, 'client', 'client.js'), 'utf8')
const manifest = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'))

let bad = 0
function must(cond, what) {
  console.log((cond ? '  ✔ ' : '  ✘ ') + what)
  if (!cond) bad++
}

console.log('== 1. 宿主半边可被真实加载（语法 + 依赖解析 + 顶层执行）==')
try {
  const coreMod = await import(new URL('./lib/core.js', import.meta.url).href)
  must(typeof coreMod.createCore === 'function', 'lib/core.js 导出 createCore 函数')
} catch (e) { must(false, 'lib/core.js 可加载 —— ' + e.message) }
try {
  const indexMod = await import(new URL('./lib/index.js', import.meta.url).href)
  must(typeof indexMod.apply === 'function', 'lib/index.js 导出 apply')
  must(Array.isArray(indexMod.inject), 'lib/index.js 导出 inject')
  must(indexMod.inject.includes('webServer') && indexMod.inject.includes('timer'),
    'inject 同时含 webServer 与 timer（body 需要 ctx.timeout/interval）')
} catch (e) { must(false, 'lib/index.js 可加载 —— ' + e.message) }

console.log('== 2. 客户端 bundle 可解析 ==')
try { new Function('window', 'require', 'document', client); must(true, 'client/client.js 可解析') }
catch (e) { must(false, 'client/client.js 可解析 —— ' + e.message) }

console.log('== 3. 生成物结构 ==')
for (const [name, src, syms] of [
  ['core.js', core, ['export async function createCore', 'contextPressure', 'sessionProjections', 'agent/pre-step', "harness.handle('bind'", "harness.handle('status'", 'verifyOwner']],
  ['client.js', client, ["__ModuleLoader__.load", "require('react')", "document.createElement('style')",
                         "/api/dsh-context-budget/", 'createCore', 'conversation.session.header.utilities', "exports.inject = ['slots', 'timer']"]],
]) for (const s of syms) must(src.includes(s), name + ' 含 ' + JSON.stringify(s))

console.log('== 4. 常驻版改动确实打上了 ==')
must(core.includes('【常驻版改动】'), 'core.js 带上了常驻版改动标记')
must(core.includes("ok = bindView(id, 'view')"), 'core.js：宿主接受非归属绑定')
must(!core.includes('忽略非归属上报'), 'core.js：旧的「忽略非归属上报」已被替换')
must(client.includes('const follow'), 'client.js：浮标恢复了上报')
must(client.includes('host.call(\'bind\''), 'client.js：确实调用 bind')

console.log('== 5. manifest ==')
must(manifest.main === 'lib/index.js', 'main 指向 lib/index.js')
must(manifest.dsh?.client?.platform === 'web', '声明了 web 客户端')
must(manifest.exports?.['./client'] === './client/client.js', '导出 ./client 供页面下发')

console.log('== 6. 安全断言（第一步只动仓库，不碰 profile）==')
must(!index.includes('process.exit'), '宿主半边不含 process.exit（历史上正是它弄死过 DSH）')
must(!index.includes('spawn') && !index.includes('child_process'), '宿主半边不启动任何子进程')

console.log('')
console.log(bad === 0 ? '全部通过 ✅' : bad + ' 项失败 ❌')
process.exit(bad === 0 ? 0 : 1)
