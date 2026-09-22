// 构建可上传的 DSH 插件集合仓库
//
// 用法: node build-repo.mjs [目标目录]
//       默认 D:\新建文件夹\ai_text\dsh-plugins-repo
//
// 特点:
//   1. 保留 .git —— 不会破坏 git 工作副本，构建后可直接 add/commit/push
//   2. 保留「包中独有、node_modules 里没有」的文件（如你自己写的说明文档）
//   3. 构建后自检 —— 确认 node_modules 与产物一致，不一致就明确标出
//
// 注意: 插件代码的唯一源头是 node_modules。
//       如果你在包里直接改了插件代码，会被本次构建覆盖——
//       请改 node_modules 里的版本，或先把改动同步回 node_modules。
import {
  existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync,
  statSync, readdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const NM = join(homedir(), '.dsh', 'profiles', 'web', 'node_modules')
const OUT = process.argv[2] || 'D:\\新建文件夹\\ai_text\\dsh-plugins-repo'
const STASH = OUT + '.preserved'

// 插件清单: [node_modules 里的名字, 仓库里的路径]
const PLUGINS = [
  ['dsh-restart-plugin', 'plugins/dsh-restart-plugin'],
  ['dsh-peak-valley-plugin', 'plugins/dsh-peak-valley-plugin'],
  ['dsh-whale-pet-plugin', 'plugins/dsh-whale-pet-plugin-patched'],
  ['dsh-webguard', 'plugins/dsh-webguard'],
]

// ───────────────────────── 阶段 1: 暂存现有产物 ─────────────────────────
// 不直接 rmSync —— 先整体挪走，这样 .git 与我们生成之外的文件都不会丢
let hadExisting = false
if (existsSync(OUT)) {
  if (existsSync(STASH)) rmSync(STASH, { recursive: true, force: true })
  cpSync(OUT, STASH, { recursive: true })
  rmSync(OUT, { recursive: true, force: true })
  hadExisting = true
  console.log('=== 阶段 1: 暂存现有产物 ===')
  console.log('   已备份到 ' + STASH)
}
mkdirSync(OUT, { recursive: true })

// ───────────────────────── 阶段 2: 从 node_modules 重建 ─────────────────────────
const copied = []
function copyPlugin(srcName, dstRel) {
  const src = join(NM, srcName)
  if (!existsSync(src)) { console.log('   ❌ 源不存在: ' + srcName); return false }
  const dst = join(OUT, dstRel)
  mkdirSync(dst, { recursive: true })
  cpSync(src, dst, {
    recursive: true,
    filter: (s) => {
      const base = s.split(/[\\/]/).pop()
      if (/\.bak-/.test(base)) return false
      return true
    },
  })
  let n = 0, bytes = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else { n++; bytes += statSync(p).size }
    }
  }
  walk(dst)
  copied.push({ name: srcName, dst: dstRel, files: n, kb: (bytes / 1024).toFixed(1) })
  console.log('   ✅ ' + dstRel.padEnd(40) + String(n).padStart(3) + ' 文件  ' + (bytes / 1024).toFixed(1) + ' KB')
  return true
}

console.log('')
console.log('=== 阶段 2: 从 node_modules 复制插件 ===')
for (const [src, dst] of PLUGINS) copyPlugin(src, dst)

// ───────────────────────── 阶段 3: 生成 patches/ ─────────────────────────
console.log('')
console.log('=== 阶段 3: 生成 patches/ ===')
const PATCH_DIR = join(OUT, 'patches', 'whale-pet')
mkdirSync(PATCH_DIR, { recursive: true })
const wpSrc = join(NM, 'dsh-whale-pet-plugin')
for (const f of ['lib/index.js', 'client/client.js']) {
  const src = join(wpSrc, f)
  const dst = join(PATCH_DIR, f.replace(/[\\/]/g, '__'))
  cpSync(src, dst)
  console.log('   ' + f.replace(/[\\/]/g, '__').padEnd(22) + (statSync(dst).size / 1024).toFixed(1) + ' KB')
}

let dshVersion = 'unknown'
try {
  const pj = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx', '1e7f6d9597241db0', 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  dshVersion = JSON.parse(readFileSync(pj, 'utf8')).version
} catch (e) { /* 保留 unknown */ }

// 不写 generatedAt 时间戳:否则每次构建都产生无意义的 diff 噪音，
// 让「构建后 git status 是否干净」失去意义。dshVersion 只在真正升级 DSH 时变。
writeFileSync(join(OUT, 'plugins.json'), JSON.stringify({
  name: 'dsh-plugin-collection',
  dshVersion,
  plugins: copied,
}, null, 2) + '\n')
console.log('')
console.log('   plugins.json 已写入 (DSH ' + dshVersion + ')')

// ───────────────────────── 阶段 4: 合并暂存物 ─────────────────────────
console.log('')
console.log('=== 阶段 4: 合并暂存物 ===')

// 4a. .git 必须原样恢复，否则 git 工作副本就断了
let gitRestored = false
if (hadExisting && existsSync(join(STASH, '.git'))) {
  cpSync(join(STASH, '.git'), join(OUT, '.git'), { recursive: true })
  gitRestored = true
  console.log('   ✅ .git 已恢复（git 工作副本保持可用）')
} else {
  console.log('   · 无 .git 可恢复（首次构建，或本来就未接入 git）')
}

// 4b. 恢复「包中独有」的文件:暂存里有、新产物里没有的
//     这些通常是手写文档（README-UPSTREAM.md / FORK-NOTICE.md 之类）
const restored = []
function walkRel(root) {
  const out = []
  const rec = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) { if (e.name !== '.git') rec(p) }
      else out.push(p.substring(root.length + 1))
    }
  }
  if (existsSync(root)) rec(root)
  return out
}
if (hadExisting) {
  for (const rel of walkRel(STASH)) {
    const inNew = existsSync(join(OUT, rel))
    if (!inNew) {
      const dst = join(OUT, rel)
      mkdirSync(join(dst, '..'), { recursive: true })
      cpSync(join(STASH, rel), dst)
      restored.push(rel)
    }
  }
  if (restored.length > 0) {
    console.log('   ✅ 恢复了 ' + restored.length + ' 个「包中独有」文件（node_modules 里没有的）:')
    for (const r of restored) console.log('        + ' + r)
  } else {
    console.log('   · 没有需要恢复的独有文件')
  }
}

// ───────────────────────── 阶段 5: 自检 ─────────────────────────
console.log('')
console.log('=== 阶段 5: 自检（产物 vs node_modules）===')
let bad = 0
for (const [srcName, dstRel] of PLUGINS) {
  const src = join(NM, srcName)
  const dst = join(OUT, dstRel)
  if (!existsSync(src) || !existsSync(dst)) { console.log('   ⚠️ 跳过 ' + srcName); continue }
  const a = walkRel(src), b = walkRel(dst)
  let diff = 0, extra = 0
  for (const rel of a) {
    const fa = join(src, rel), fb = join(dst, rel)
    if (!existsSync(fb)) { diff++; continue }
    if (statSync(fa).size !== statSync(fb).size) { diff++; continue }
    if (readFileSync(fa).compare(readFileSync(fb)) !== 0) diff++
  }
  for (const rel of b) if (!a.includes(rel)) extra++
  const okFlag = diff === 0
  if (!okFlag) bad++
  console.log('   ' + (okFlag ? '✅' : '❌') + ' ' + dstRel.padEnd(40) +
    'nm=' + String(a.length).padStart(3) + ' 产物=' + String(b.length).padStart(3) +
    ' 内容不同=' + diff + ' 产物独有=' + extra)
}

console.log('')
console.log('=== 完成 ===')
console.log('   输出目录: ' + OUT)

// 清理暂存目录（合并成功后它就没用了，6 MB 左右）
if (hadExisting && existsSync(STASH)) {
  try { rmSync(STASH, { recursive: true, force: true }); console.log('   已清理暂存目录') }
  catch (e) { console.log('   ⚠️ 暂存目录未能删除（可手动删）: ' + STASH) }
}
if (gitRestored) {
  console.log('   git 工作副本已保留，可直接:')
  console.log('      git add -A && git commit -m "..." && git push')
}
if (restored.length > 0) {
  console.log('')
  console.log('   提示: 上面恢复的文件只存在于仓库里，不在 node_modules。')
  console.log('         如果你希望它们由构建生成，请把它们也放进 node_modules 对应插件目录。')
}

// ── 非构建产物目录检查 ──
// 本脚本只认识从 node_modules 复制的常驻插件。仓库里还可能有【不由本脚本生成】的东西
// （例如 dsh-context-budget 这种动态 Cordis 插件目录）。它们靠"保留包中独有文件"存活，
// 但必须显式确认，否则将来改了这个逻辑会静默删掉它们。
const KNOWN_DIRS = new Set(PLUGINS.map(([, dst]) => dst.replace(/^plugins\//, '')))
const pluginsRoot = join(OUT, 'plugins')
const extraDirs = existsSync(pluginsRoot)
  ? readdirSync(pluginsRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !KNOWN_DIRS.has(e.name)).map((e) => e.name)
  : []
if (extraDirs.length > 0) {
  console.log('')
  console.log('   非构建产物目录（由本脚本之外的来源维护，已保留）:')
  for (const d of extraDirs) {
    const n = walkRel(join(pluginsRoot, d)).length
    console.log('      · plugins/' + d + '  (' + n + ' 文件)')
  }
  console.log('      ⚠️ 这些目录不会被本脚本更新；改动它们请直接编辑并提交。')
}

// ── 回退指引：删掉的 README/INSTALL 等可从 git 取回 ──
if (gitRestored) {
  console.log('')
  console.log('   若发现 README.md / INSTALL.md / LICENSE 等被回退成旧版（本脚本会从暂存恢复它们），')
  console.log('   用 git 取回最新版即可:  git checkout -- README.md INSTALL.md LICENSE')
}
if (bad > 0) {
  console.log('')
  console.log('   ⚠️ 有 ' + bad + ' 个插件内容与 node_modules 不一致，请检查上面的输出')
  process.exitCode = 1
}
