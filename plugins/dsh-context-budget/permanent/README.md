# permanent/ — 常驻版（重启后自动启动）

> **状态：已安装进 profile 并验证通过。**
> 实测证据（2026-09-23 22:51）：
> - `GET /api/dsh-context-budget/status` → **405**（路由已挂载，只收 POST）；DSH 未被影响
> - `POST .../status {}` → `phase: waiting-bind`, `polls: 2`（宿主轮询循环在跑）
> - `POST .../status {"sessionId":"session-0bd20ccf-…"}` → 现场实测返回 `65.2%`（测量链路在常驻上下文里正常）
> - `POST .../bind {"sessionId":…}` → `{ok:true, source:"view"}`，工作区立刻出现并更新 `上下文经验教训-0bd20ccf.md`
>
> **还差最后一步：F5 刷新一次页面**，客户端 bundle 才会下发（它不会自动热加载）。之后重启 DSH 也不用手动拉起。

---

## 一、为什么需要它

| | 动态 Cordis 插件（本包 `../`） | 常驻插件包（本目录） |
|---|---|---|
| 代码在哪 | **只在当前 DSH 进程的内存里** | `~\.dsh\profiles\web\node_modules\dsh-context-budget-plugin` |
| 谁加载 | 模型调 `cordis_define` / `cordis_run` | DSH 启动时按 profile 的 `cordis.patch.yml` 那一行 |
| 重启后 | **一定消失** | 自动加载 |

动态插件**没有任何办法**做到重启后自动启动 —— 这是设计使然，不是配置问题。要长期用就只能做成常驻包。

---

## 二、怎么生成的（可复现）

```powershell
node plugins\dsh-context-budget\permanent\build.mjs
```

`build.mjs` 从 `../lib/host.js` 与 `../lib/client.js` 读取动态版源码，**逐字保留 body**，只包一层提供等价符号的外壳：

| 动态沙箱注入 | 常驻版的等价物 |
|---|---|
| 宿主 `harness.handle(name, fn)` | `POST /api/dsh-context-budget/<name>` |
| 宿主 `ctx.get('fs')` | 真 `node:fs` 适配器 |
| 客户端 `host.call(m, args)` | `fetch('/api/dsh-context-budget/' + m)` |
| 客户端 `styles.insert(css)` | 自己往 `document.head` 插 `<style>` |
| 客户端 `React` | `require('react')` |

这条流水线来自本仓库已验证过的做法（原始工具 `_archive/tools/scripts/build-permanent-plugin.mjs`，说明 `_archive/skills/persisting-cordis-plugins/SKILL.md`）。

---

## 三、常驻版改了什么（**两处，其余逐字未动**）

`build.mjs` 用**精确替换 + 命中数断言**打补丁：不命中或不唯一就直接构建失败，不会悄悄产出坏包。

### 改动 1（宿主）：接受非归属绑定

```js
// 动态版：非归属上报一律忽略（因为 tool.view.cordis 的归属锚点能核实归属）
S.switchNote = '忽略非归属上报 ' + … ; ok = false
// 常驻版：
ok = bindView(id, 'view')
```

**为什么**：常驻插件**没有 `cordis_run` 卡片**，所以 `tool.view.cordis` 永远不渲染，归属锚点永远不会上报。会话头部浮标的上报就成了唯一线索。

**为什么在这里是安全的**：① 显示早已按会话隔离（浮标只读 `status({sessionId})`）；② 每个会话各自一份 `上下文经验教训-<短id>.md`，多会话同时上报只是"各自维护各自的文档"，不是串号。

### 改动 2（客户端）：浮标恢复上报

```js
const follow = () => { host.call('bind', { sessionId: sid }) }
follow(); const d2 = ctx.interval(follow, 30000)
```

**为什么**：动态版刻意去掉了这个上报（归属由锚点决定）。常驻版必须加回来，否则宿主永远不知道该给哪个会话写文档。

---

## 四、目录结构

```
permanent/
  build.mjs           生成器（含上述两处改动的断言）
  check.mjs           自检：真实 import 宿主半边 + 解析客户端 bundle + 结构/改动/安全断言
  package.json        生成，main = lib/index.js
  lib/core.js         生成：动态版 body 逐字保留 + 两处常驻改动
  lib/index.js        手写：外壳（webServer 路由 + node:fs 适配器）
  client/client.js    生成：客户端 bundle
  README.md           本文件
```

自检：

```powershell
node plugins\dsh-context-budget\permanent\check.mjs
```

---

## 五、安装（**第二步，需重启 DSH**）

> ⚠️ 本工作区历史上因为**热加载**一个会 `process.exit()` 的插件，DSH 当场死亡、`.dsh` 配置目录被删、多个会话丢失。
> 本插件不含 `process.exit`、不启动子进程（`check.mjs` 第 6 节有断言），但仍应按规矩来：**先备份、然后正常重启，不要靠 patch 热加载**。

```powershell
$repo = "D:\新建文件夹\ai_text\dsh-plugins-repo\plugins\dsh-context-budget\permanent"
$prof = "$env:USERPROFILE\.dsh\profiles\web"
$dst  = "$prof\node_modules\dsh-context-budget-plugin"

# 1) 备份 patch 层
Copy-Item "$prof\cordis.patch.yml" "$prof\cordis.patch.yml.bak-$(Get-Date -Format yyyy-MM-ddTHH-mm-ss)"

# 2) 只拷运行所需的三个东西
New-Item -ItemType Directory -Force -Path "$dst\lib", "$dst\client" | Out-Null
Copy-Item "$repo\package.json"     "$dst\package.json" -Force
Copy-Item "$repo\lib\core.js"      "$dst\lib\core.js"  -Force
Copy-Item "$repo\lib\index.js"     "$dst\lib\index.js" -Force
Copy-Item "$repo\client\client.js" "$dst\client\client.js" -Force

# 3) 在 cordis.patch.yml 末尾追加一行（注意缩进是两个空格 + 四个空格）
#    - insert:
#        - id: context-budget
#          name: dsh-context-budget-plugin

# 4) 正常重启 DSH（不是热加载）

# 5) 启动后 F5 刷新一次页面 —— 客户端 bundle 不会自动热加载
```

## 六、验证（别只看"没报错"）

```powershell
# a) 宿主半边是否真的加载：路由应当回应（405 = 已挂载但只收 POST）
node -e "fetch('http://127.0.0.1:3080/api/dsh-context-budget/status',{method:'GET'}).then(r=>console.log('HTTP',r.status))"
# 期望 HTTP 405（说明路由在了）；404 说明宿主半边没加载

# b) 页面里是否真的下发了这个 bundle
node -e "fetch('http://127.0.0.1:3080/').then(r=>r.text()).then(t=>console.log(t.includes('dsh-context-budget-plugin')))"

# c) 最终判据：随便发一句话之后，工作区出现/更新 上下文经验教训-<会话短id>.md
#    且文档头部「轮询心跳」行持续前进
```

## 七、卸载

```powershell
# 1) 从 cordis.patch.yml 删掉那三行
# 2) 删目录
Remove-Item "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-context-budget-plugin" -Recurse -Force
# 3) 重启 DSH
```

## 八、已知差异（相对动态版）

1. **常驻版会在 DSH 启动时加载**，但此时没有任何会话被显示，所以宿主处于 `waiting-bind`、不写任何文件 —— **没有启动副作用**。要等浏览器页面上的浮标上报之后才开始工作。
2. **文档归属**由"哪个对话的浮标在上报"决定。多个对话同时挂着时，各自的文档会各自维护（不是串号，但也**不是**只维护一个）。
3. **`agent/pre-step` 注入告警**需要占用率真到 100% 才会触发 —— 与动态版一样，这条路径尚未在真机上验证过。
