/**
 * 从「动态 Cordis 插件」源码生成「常驻插件包」（永久版）。
 *
 * 做法沿用本仓库已验证过的流水线（原始工具见
 * `_archive/tools/scripts/build-permanent-plugin.mjs`，含说明文档
 * `_archive/skills/persisting-cordis-plugins/SKILL.md`）：
 *
 *   **不重写逻辑** —— 把动态包的 body 原样包进一个提供等价符号的外壳里。
 *
 *   宿主：`harness.handle(name, fn)` -> POST /api/<slug>/<name>
 *         `ctx.get('fs')`            -> 真 node:fs 适配器
 *   客户端：`host.call(m, args)`      -> fetch 那个路由
 *           `styles.insert(css)`     -> 自己插 <style>
 *           `React`                  -> require('react')
 *
 * 与本仓库既有案例的唯一区别：本插件还需要两处**已知且最小**的改动，
 * 原因见 README 的「常驻版改了什么」。改动在这里显式声明并断言命中一次，
 * 所以要么完全按预期打上，要么直接构建失败 —— 不会悄悄产出一个坏包。
 *
 * 用法：node permanent/build.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = join(HERE, '..')
const OUT = HERE

const SLUG = 'dsh-context-budget'
const PLUGIN_NAME = 'dsh-context-budget-plugin'

/** 精确替换一次；不命中或不唯一就抛错（宁可构建失败，也不要产出坏包）。 */
function patchOnce(source, from, to, label) {
  const parts = source.split(from)
  if (parts.length !== 2) {
    throw new Error(`常驻版改动「${label}」预期命中 1 次，实际 ${parts.length - 1} 次 —— 源码已变，请同步更新 permanent/build.mjs`)
  }
  return parts[0] + to + parts[1]
}

// ── 读动态版源码 ────────────────────────────────────────────────────────────
const hostSrc = readFileSync(join(PKG, 'lib', 'host.js'), 'utf8')
const clientSrc = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')

// ── 常驻版改动 1/2：宿主半接受非归属绑定 ────────────────────────────────────
// 动态版里 `tool.view.cordis` 那套归属锚点能核实归属，所以非归属上报被忽略。
// 常驻版**根本没有 cordis_run 卡片**，归属锚点永远不会渲染 —— 会话头部浮标
// 的上报成了唯一信号。多个已挂载会话同时上报在这里无害：显示早已按会话隔离，
// 而每个会话各自有一份文档文件。
const hostPatched = patchOnce(
  hostSrc,
  `            // 非归属上报一律忽略：实测多个已挂载会话都会上报，接受它只会让绑定来回跳。\n            S.switchNote = '忽略非归属上报 ' + String(id).slice(8, 16)\n            ok = false`,
  `            // 【常驻版改动】没有 cordis_run 卡片，归属锚点永不渲染，所以会话头部\n            // 浮标的上报就是唯一信号。多会话同时上报无害：显示按会话隔离，文档各一份。\n            ok = bindView(id, 'view')`,
  'host: 接受非归属绑定',
)

// ── 常驻版改动 2/2：客户端浮标恢复上报自己 ──────────────────────────────────
// 动态版刻意去掉了这个上报（归属由锚点决定）。常驻版必须把它加回来，
// 否则宿主永远不知道该给哪个会话写文档。
const clientPatched = patchOnce(
  clientSrc,
  `        tick()\n        const d1 = ctx.interval(tick, 4000)\n        // 注意：这里刻意不再向宿主上报绑定。浮标只读 status({sessionId})，\n        // 与「宿主当前绑定哪个会话」完全无关；文档与告警一律由归属锚点决定。\n        return () => {\n          alive = false\n          if (typeof d1 === 'function') d1()\n        }`,
  `        tick()\n        const d1 = ctx.interval(tick, 4000)\n        // 【常驻版改动】把自己正在被显示这件事告诉宿主 —— 没有归属锚点之后，\n        // 这是唯一的归属线索；每个会话各自有一份文档，多会话上报无害。\n        const follow = () => { Promise.resolve(host.call('bind', { sessionId: sid })).catch(() => { }) }\n        follow()\n        const d2 = ctx.interval(follow, 30000)\n        return () => {\n          alive = false\n          if (typeof d1 === 'function') d1()\n          if (typeof d2 === 'function') d2()\n        }`,
  'client: 浮标恢复上报',
)

// ── 生成 ────────────────────────────────────────────────────────────────────
mkdirSync(join(OUT, 'lib'), { recursive: true })
mkdirSync(join(OUT, 'client'), { recursive: true })

const hostCore = `/**
 * Host core — 由 permanent/build.mjs 从 ../lib/host.js 生成，请勿手改：
 * 改源码后重新构建，行为才与审阅过的版本一致。
 *
 * body 保持沙箱里的形状：自由符号 \`ctx\` 与 \`harness\`，以
 * \`return { apply(ctx) { … } }\` 结尾。
 */
/* eslint-disable */
export async function createCore(ctx, harness) {
${hostPatched}
}
`
writeFileSync(join(OUT, 'lib', 'core.js'), hostCore)

const clientBundle = `/**
 * Browser half — 由 permanent/build.mjs 从 ../lib/client.js 生成，
 * 再装进常驻客户端的 bundle 格式。body 逐字保留，沙箱注入的符号在下面接好。
 */
window.__ModuleLoader__.load({
  id: '${PLUGIN_NAME}',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports

    // 平台自己的动态客户端 runner 就是这么拿 React 的。
    var React = require('react')

    /** 由本插件拥有的 <style> 元素，随插件一起移除。 */
    var styleElement = null
    function removeStyle() {
      if (styleElement !== null && styleElement.parentNode) styleElement.parentNode.removeChild(styleElement)
      styleElement = null
    }
    var styles = {
      insert: function (css) {
        removeStyle()
        styleElement = document.createElement('style')
        styleElement.setAttribute('data-plugin', '${PLUGIN_NAME}')
        styleElement.textContent = css
        document.head.appendChild(styleElement)
        return removeStyle
      },
    }

    /** 原本的包内 RPC，现在就是一条同源 HTTP 路由。 */
    var host = {
      call: function (method, args) {
        return window
          .fetch('/api/${SLUG}/' + encodeURIComponent(method), {
            method: 'POST',
            cache: 'no-store',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(args === undefined ? null : args),
          })
          .then(function (response) {
            return response.json().then(function (body) {
              if (!response.ok) throw new Error((body && body.error) || 'HTTP ' + response.status)
              return body
            })
          })
      },
    }

function createCore(ctx, React, host, styles) {
${clientPatched}
}

    exports.apply = function (ctx) {
      return Promise.resolve(createCore(ctx, React, host, styles)).then(function (core) {
        return core.apply(ctx)
      })
    }
    exports.inject = ['slots', 'timer']
    return module.exports
  },
})
`
writeFileSync(join(OUT, 'client', 'client.js'), clientBundle)

const packageJson = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  private: true,
  type: 'module',
  main: 'lib/index.js',
  exports: {
    '.': './lib/index.js',
    './client': './client/client.js',
    './package.json': './package.json',
  },
  peerDependencies: { '@deepseek-ai/cordis': '>=4.0.1 <5.0.0-0' },
  dsh: { client: { platform: 'web' } },
}
writeFileSync(join(OUT, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)

console.log(`宿主 core : ${join('lib', 'core.js')} (${hostCore.length} B)`)
console.log(`客户端 bundle: ${join('client', 'client.js')} (${clientBundle.length} B)`)
console.log(`manifest  : package.json`)
console.log(`路由前缀  : /api/${SLUG}/<method>`)
