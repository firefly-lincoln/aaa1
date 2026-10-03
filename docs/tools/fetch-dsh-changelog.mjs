// 经代理获取 DSH 官方 release 说明
const PROXY = 'http://127.0.0.1:7897'
const API = 'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=15'

const { execFileSync } = await import('node:child_process')
let raw
try {
  raw = execFileSync('C:\\Windows\\System32\\curl.exe', [
    '-sS', '--max-time', '40', '--proxy', PROXY,
    '-H', 'User-Agent: dsh-changelog-check',
    '-H', 'Accept: application/vnd.github+json',
    API,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
} catch (e) {
  console.log('请求失败: ' + (e.stdout || e.message).toString().slice(0, 300))
  process.exit(0)
}

let j
try { j = JSON.parse(raw) } catch (e) {
  console.log('解析失败，原始前 400 字:')
  console.log(raw.slice(0, 400))
  process.exit(0)
}

if (!Array.isArray(j)) {
  console.log('返回不是数组: ' + JSON.stringify(j).slice(0, 300))
  process.exit(0)
}

console.log('共取到 ' + j.length + ' 个 release')
console.log('')

// 落盘供后续解析（不依赖 shell 重定向，避免被 Select-Object 截断）
const { writeFileSync } = await import('node:fs')
const OUT = 'D:\\新建文件夹\\ai_text\\_dsh-releases.txt'
const chunks = []
for (const r of j) {
  chunks.push('='.repeat(78))
  chunks.push('TAG: ' + r.tag_name + ' | ' + (r.name || '') + ' | published: ' + (r.published_at || '').slice(0, 10) + ' | prerelease: ' + r.prerelease)
  chunks.push('URL: ' + r.html_url)
  chunks.push('-'.repeat(78))
  chunks.push((r.body || '(no body)').trim())
  chunks.push('')
}
writeFileSync(OUT, chunks.join('\n'), 'utf8')
console.log('已写入 ' + OUT + ' (' + chunks.join('\n').length + ' 字符)')
console.log('')

for (const r of j) {
  const isTarget = /0\.1\.[67]/.test(r.tag_name) || /0\.2\.0/.test(r.tag_name)
  console.log('═'.repeat(78))
  console.log((isTarget ? '★ ' : '  ') + r.tag_name + '   ' + (r.name || ''))
  console.log('   发布: ' + (r.published_at || '').slice(0, 10) + '   预发布: ' + r.prerelease)
  console.log('   链接: ' + r.html_url)
  console.log('─'.repeat(78))
  const body = (r.body || '(无正文)').trim()
  console.log(body.length > 6000 ? body.slice(0, 6000) + '\n…（截断，全文见上面的链接）' : body)
  console.log('')
}
