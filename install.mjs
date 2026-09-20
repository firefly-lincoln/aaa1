#!/usr/bin/env node
/**
 * DSH 插件集合 · 安装 / 校验 / 更新
 *
 *   node install.mjs                     安装全部（webguard 除外）
 *   node install.mjs --only whale-pet    只装指定插件（可逗号分隔）
 *   node install.mjs --list              列出可用插件与当前状态
 *   node install.mjs --verify            只校验，不复制
 *   node install.mjs --dry-run           只打印计划，不动文件
 *
 * 特性：
 *   · 幂等 —— 可反复执行
 *   · 安装前自动备份 cordis.patch.yml（带时间戳）
 *   · 每个文件做语法检查 + 关键符号断言
 *   · 不改动 profile 的 package.json（避免触发 pnpm install 覆盖本地修复）
 */
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  copyFileSync, readdirSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE = join(DSH_HOME, 'profiles', 'web')
const NM = join(PROFILE, 'node_modules')
const PATCH_FILE = join(PROFILE, 'cordis.patch.yml')

// ─────────────────────────── 插件清单 ───────────────────────────
const PLUGINS = [
  {
    key: 'restart',
    name: 'dsh-restart-plugin',
    srcDir: 'plugins/dsh-restart-plugin',
    id: 'dsh-restart',
    desc: '一键重启 DSH',
    default: true,
  },
  {
    key: 'peak-valley',
    name: 'dsh-peak-valley-plugin',
    srcDir: 'plugins/dsh-peak-valley-plugin',
    id: 'dsh-peak-valley',
    desc: '峰谷电价与节假日',
    default: true,
  },
  {
    key: 'whale-pet',
    name: 'dsh-whale-pet-plugin',
    srcDir: 'plugins/dsh-whale-pet-plugin-patched',
    id: 'whale-pet',
    desc: '鲸鱼娘桌宠（修复版）',
    default: true,
    // 关键符号断言：确认修复真的在位
    asserts: [
      { file: 'lib/index.js', pattern: /browserPetEnabled/g, min: 4, label: '浏览器桌宠开关' },
      { file: 'lib/index.js', pattern: /PRICE_TABLE/g, min: 2, label: '按模型选价' },
      { file: 'lib/index.js', pattern: /isPeakNow/g, min: 2, label: '峰谷含星期判定' },
      { file: 'lib/index.js', pattern: /recomputeMonthlyCost/g, min: 3, label: '月度账本自愈' },
      { file: 'lib/index.js', pattern: /maybeAutoLaunch/g, min: 4, label: '自动拉起双路径' },
      { file: 'lib/index.js', pattern: /detached: true/g, max: 0, label: '已移除 detached（不得出现）' },
      { file: 'client/client.js', pattern: /browserPetEnabled/g, min: 3, label: '客户端开关' },
    ],
  },
  {
    key: 'webguard',
    name: 'dsh-webguard',
    srcDir: 'plugins/dsh-webguard',
    id: 'dsh-webguard',
    desc: '端口冲突检测（默认不装，见 README）',
    default: false,
    asserts: [
      { file: 'index.js', pattern: /webServer\.port !== undefined/g, min: 1, label: '自身端口守卫（致命缺陷修复）' },
    ],
  },
]

// ─────────────────────────── 参数解析 ───────────────────────────
const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

const LIST = flag('--list')
const VERIFY = flag('--verify')
const DRY = flag('--dry-run')
const ONLY = opt('--only')

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[31m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m',
}
const ok = (s) => console.log('   ' + C.green + '✓' + C.reset + ' ' + s)
const bad = (s) => console.log('   ' + C.red + '✗' + C.reset + ' ' + s)
const warn = (s) => console.log('   ' + C.yellow + '!' + C.reset + ' ' + s)
const info = (s) => console.log('   ' + C.dim + s + C.reset)

function targetDir(p) { return join(NM, p.name) }

/**
 * 逐文件复制，不删目标目录。
 *
 * 为什么不「先删再拷」：运行中的 DSH 已经用 ESM 加载了插件的 .js，Windows 会锁住
 * 那些文件句柄，rmSync 会直接 EPERM 失败。逐文件复制能让未锁定的文件正常更新，
 * 被锁的单独报告，不会因为一个文件失败就中断整个安装。
 */
function copyTree(src, dst) {
  let copied = 0
  const locked = []
  const walk = (from, to) => {
    mkdirSync(to, { recursive: true })
    for (const e of readdirSync(from, { withFileTypes: true })) {
      const s = join(from, e.name)
      const d = join(to, e.name)
      if (e.isDirectory()) { walk(s, d); continue }
      try { copyFileSync(s, d); copied++ }
      catch (err) { locked.push({ name: e.name, code: err.code }) }
    }
  }
  walk(src, dst)
  return { copied, locked }
}

function installedVersion(p) {
  const pj = join(targetDir(p), 'package.json')
  if (!existsSync(pj)) return null
  try { return JSON.parse(readFileSync(pj, 'utf8')).version || '?' } catch (e) { return '?' }
}

function srcVersion(p) {
  const pj = join(HERE, p.srcDir, 'package.json')
  if (!existsSync(pj)) return null
  try { return JSON.parse(readFileSync(pj, 'utf8')).version || '?' } catch (e) { return '?' }
}

// ─────────────────────────── --list ───────────────────────────
if (LIST) {
  console.log('')
  console.log(C.bold + 'DSH 插件集合' + C.reset)
  console.log(C.dim + '  profile: ' + PROFILE + C.reset)
  console.log('')
  console.log('  ' + 'key'.padEnd(14) + 'name'.padEnd(30) + 'v(仓库)'.padEnd(12) + '状态')
  console.log('  ' + '─'.repeat(72))
  for (const p of PLUGINS) {
    const sv = srcVersion(p) || '缺失'
    const iv = installedVersion(p)
    const state = iv === null ? C.dim + '未安装' + C.reset
      : iv === sv ? C.green + '已安装 ' + iv + C.reset
        : C.yellow + '已安装 ' + iv + '（仓库为 ' + sv + '）' + C.reset
    const tag = p.default ? '' : C.yellow + ' [默认不装]' + C.reset
    console.log('  ' + p.key.padEnd(14) + p.name.padEnd(30) + String(sv).padEnd(12) + state + tag)
  }
  console.log('')
  console.log('  用法: node install.mjs [--only key1,key2] [--verify] [--dry-run]')
  console.log('')
  process.exit(0)
}

// ─────────────────────────── 选择目标 ───────────────────────────
let targets
if (ONLY) {
  const keys = ONLY.split(',').map((s) => s.trim()).filter(Boolean)
  targets = PLUGINS.filter((p) => keys.includes(p.key))
  const unknown = keys.filter((k) => !PLUGINS.some((p) => p.key === k))
  if (unknown.length) {
    bad('未知插件 key: ' + unknown.join(', '))
    console.log('   可用: ' + PLUGINS.map((p) => p.key).join(', '))
    process.exit(1)
  }
} else {
  targets = PLUGINS.filter((p) => p.default)
  const skipped = PLUGINS.filter((p) => !p.default)
  if (skipped.length) {
    console.log('')
    warn('默认跳过: ' + skipped.map((p) => p.key).join(', ') + '（要装请用 --only ' + skipped[0].key + '）')
  }
}

// ─────────────────────────── 前置检查 ───────────────────────────
console.log('')
console.log(C.bold + (VERIFY ? '校验插件' : DRY ? '安装计划（未执行）' : '安装插件') + C.reset)
console.log(C.dim + '  DSH_HOME: ' + DSH_HOME + C.reset)
console.log('')

if (!existsSync(PROFILE)) {
  bad('找不到 profile 目录: ' + PROFILE)
  console.log('   DSH 是否已至少启动过一次？或设置 DSH_HOME 环境变量。')
  process.exit(1)
}
if (!existsSync(NM)) {
  bad('找不到 node_modules: ' + NM)
  process.exit(1)
}

// ─────────────────────────── 逐插件处理 ───────────────────────────
let failures = 0
let lockedFiles = 0
const results = []

for (const p of targets) {
  const src = join(HERE, p.srcDir)
  const dst = targetDir(p)

  console.log(C.bold + p.name + C.reset + C.dim + '  (' + p.key + ')' + C.reset)
  info(p.desc)

  if (!existsSync(src)) { bad('仓库里缺少 ' + p.srcDir); failures++; console.log(''); continue }

  const already = existsSync(dst)
  const isUpdate = already && installedVersion(p) !== srcVersion(p)
  info(already ? (isUpdate ? '已安装 ' + installedVersion(p) + ' → 更新为 ' + srcVersion(p) : '已安装（版本相同，将刷新文件）') : '全新安装')

  if (DRY) {
    info('计划: 复制 ' + p.srcDir + ' → ' + dst)
    info('计划: 写入 patch 条目 id=' + p.id)
    console.log('')
    continue
  }

  if (VERIFY) {
    if (!already) { bad('未安装，跳过校验'); failures++; console.log(''); continue }
  } else {
    // 逐文件覆盖（不删目录 —— 运行中的 DSH 会锁住已加载的 .js）
    try {
      const r = copyTree(src, dst)
      ok('已复制 ' + r.copied + ' 个文件 → ' + dst)
      if (r.locked.length > 0) {
        warn(r.locked.length + ' 个文件被占用未更新: ' + r.locked.map((x) => x.name + '(' + x.code + ')').join(', '))
        info('被运行中的 DSH 锁定属正常现象；重启 DSH 后再执行一次即可更新它们')
        lockedFiles += r.locked.length
      }
    } catch (e) {
      bad('复制失败: ' + e.message); failures++; console.log(''); continue
    }
  }

  // 语法检查
  let syntaxOk = true
  const jsFiles = ['lib/index.js', 'lib/core.js', 'index.js', 'client/client.js']
  for (const rel of jsFiles) {
    const f = join(dst, rel)
    if (!existsSync(f)) continue
    try {
      const src2 = readFileSync(f, 'utf8')
      // client 半边是 ModuleLoader 包装的 CommonJS，用 vm 解析；其余用 node --check
      if (rel.startsWith('client/')) {
        const vm = await import('node:vm')
        new vm.Script(src2, { filename: rel })
      } else {
        execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
      }
      ok('语法 ' + rel)
    } catch (e) {
      bad('语法错误 ' + rel + ': ' + String(e.message).split('\n')[0])
      syntaxOk = false; failures++
    }
  }
  if (!syntaxOk) { console.log(''); continue }

  // 关键符号断言
  if (p.asserts) {
    let allOk = true
    for (const a of p.asserts) {
      const f = join(dst, a.file)
      if (!existsSync(f)) { bad('断言目标缺失 ' + a.file); allOk = false; failures++; continue }
      const n = (readFileSync(f, 'utf8').match(a.pattern) || []).length
      const pass = (a.min === undefined || n >= a.min) && (a.max === undefined || n <= a.max)
      if (pass) ok(a.label + C.dim + '  (匹配 ' + n + ')' + C.reset)
      else { bad(a.label + ' —— 实得 ' + n + '，期望 ' + (a.min !== undefined ? '≥' + a.min : '≤' + a.max)); allOk = false; failures++ }
    }
    if (!allOk) warn('本插件部分断言未通过，文件可能不是修复版')
  }

  results.push(p)
  console.log('')
}

// ─────────────────────────── patch 文件接线 ───────────────────────────
if (!VERIFY && !DRY && results.length > 0) {
  console.log(C.bold + 'cordis.patch.yml' + C.reset)
  if (!existsSync(PATCH_FILE)) {
    warn('patch 文件不存在，将新建')
    const lines = ['# DSH profile patch 层', '# 由 install.mjs 生成', '']
    for (const p of results) lines.push('- insert:', '    - id: ' + p.id, '      name: ' + p.name)
    writeFileSync(PATCH_FILE, lines.join('\n') + '\n', 'utf8')
    ok('已新建')
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    copyFileSync(PATCH_FILE, PATCH_FILE + '.bak-' + stamp)
    ok('已备份 → cordis.patch.yml.bak-' + stamp)

    let text = readFileSync(PATCH_FILE, 'utf8')
    let changed = false
    for (const p of results) {
      if (new RegExp('id:\\s*' + p.id + '\\b').test(text)) { info('条目已存在: ' + p.id); continue }
      if (text.length > 0 && !text.endsWith('\n')) text += '\n'
      text += '- insert:\n    - id: ' + p.id + '\n      name: ' + p.name + '\n'
      ok('已追加条目: ' + p.id)
      changed = true
    }
    if (changed) writeFileSync(PATCH_FILE, text, 'utf8')
    else info('无需改动')
  }
  console.log('')
}

// ─────────────────────────── 结尾 ───────────────────────────
console.log('─'.repeat(60))
if (failures === 0) {
  console.log(C.green + C.bold + '全部通过' + C.reset + (DRY ? '（未做任何改动）' : ''))
  if (lockedFiles > 0) {
    console.log('')
    console.log(C.yellow + '⚠ 有 ' + lockedFiles + ' 个文件因被 DSH 占用而未更新。' + C.reset)
    console.log('  重启 DSH 释放文件句柄后，再执行一次 node install.mjs 即可补齐。')
  }
  if (!DRY && !VERIFY) {
    console.log('')
    console.log(C.yellow + '⚠ 必须重启 DSH 才生效。' + C.reset)
    console.log('  profile 带 "patchReload": "live"，但它只监视 patch 文件，')
    console.log('  不会重新加载插件源码 —— 改了插件代码一定要重启。')
  }
} else {
  console.log(C.red + C.bold + failures + ' 项失败' + C.reset + '，请检查上面的输出')
  process.exitCode = 1
}
console.log('')
