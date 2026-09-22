# 交接说明 —— 致后续所有新对话的 AI

> **初版 2026-09-20 23:10,2026-09-22 修订**,替代并作废此前的同名文档(已归档到 `_archive\`)。
> 本文档**完全自包含**,读者无需任何前置上下文,请**完整读完再动手**。
> 本次修订:新增 5 个插件目录（含动态插件 `dsh-context-budget`）、桌宠第 9 项修复、错误 7/8、代理与多 AI 协作提醒。

> ### 🔀 2026-09-22 补充:现在有**三份**交接文档,都要读
>
> | 文档 | 讲什么 |
> |---|---|
> | **本文档** | DSH **插件仓库**(桌宠 / 峰谷插件 / 上下文预算 / webguard 事故史) |
> | **`交接说明-游戏原型.md`** | `prototype\` 里的**城市应急指挥游戏**(93 轮开发) |
> | **`读取DSH上下文用量-方法.md`** | 怎么读会话的 token 用量(工具文档) |
>
> **本文档第一节「铁律」对三份都适用** —— 尤其:
> 改插件必须重启 DSH、绝不改运行中的 npx 包、热加载会杀死 DSH。
>
> **如果用户让你做游戏相关的事** → 读 `交接说明-游戏原型.md`,
> 那份记录了游戏开发中反复犯的 9 类错误(核心是「先插桩,别猜」)。
>
> **关于 `dsh-context-budget`（上下文预算监控）** → 见本文档第四节「项目地图」，
> 它是**动态 Cordis 插件**，与其它四个常驻包的装法完全不同，重启 DSH 后会消失。

---

## 〇、这份文档为什么存在

上一任 AI(我)在这个工作区里**连续犯了 6 类可复现的错误**,每一个都浪费了大量时间。
本文档的核心不是"项目介绍",而是**把那些坑标出来**,让你不重蹈覆辙。

**如果你只读一节,请读第一节「铁律」。**

---

## 一、⚠️ 铁律(违反会浪费几小时,或直接搞崩 DSH)

### 1. `patchReload: live` **不会**重载插件源码 —— 改了代码必须重启 DSH

`~\.dsh\profiles\web\package.json` 里有 `"patchReload": "live"`,它**只监视 patch 文件**(`cordis.patch.yml`)的改动,**不会**重新加载插件自己的 `.js`。

**我因此白测了 5 轮**:文件明明改对了,跑的一直是内存里的旧代码。

**判断改动是否生效的方法**:加一行"可观测标记"(写日志、改行为),重启后看日志。**不要假设热加载生效。**

实测复现:
```
把重试次数 3 改成 4 → 触发行为 → 日志仍显示 "3 attempts"   ← 证明未重载
```

### 2. 有副作用的插件**绝不能**靠 patch 热加载

`cordis.patch.yml` 一改就**立即作用于正在运行的 DSH**。

任何会 `process.exit()`、杀进程、占端口的插件,用热加载引入 = **在你改文件的瞬间运行**。

> **真实事故**:`dsh-webguard` 被热加载后探测到"端口已被占用"(其实是它自己),
> 于是 `process.exit(0)`,**DSH 当场死亡**,`.dsh` 配置目录被删除,多个会话丢失。
> 时间线:19:22:19 改 patch 文件 → 热加载 → 自杀。

**它已在仓库里修好了缺陷**(`if (webServer.port !== undefined) return`),但**仍然默认不安装**。

### 3. ⛔ 绝不修改运行中的 npx 包

```
C:\Users\10766\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh\
```

**这不是源码树,是已发布的 npm 包**。改它 = 直接改正在运行的进程的代码镜像。Node 边读边执行,文件一改,进程立刻死在半个函数上。

**这就是 `dsh-webguard` 事故的机制。**

### 4. 改 JavaScript 文件**必须**语法检查后再交付

我犯过两次:
- 把 Markdown 说明和 JS 代码塞进同一个 `.mjs` → `SyntaxError` → **已经推送到 GitHub 才发现**
- 用嵌套引号拼 PowerShell `-Command` → 自己写错 → 误判成"桌宠脚本有语法错误",浪费一轮

**规矩**:改完先 `node --check`,通过再提交/交付。

### 5. 推理不通时,先**插桩观测**,别继续猜

我连续 4 次假设全错(见第三节)。真正解决问题的是**一行插桩日志**,而它本该更早做。

**当推理链反复失败时,停止推理、开始观测。**

### 6. 用 PowerShell 读 UTF-8 文件要指定编码

`Get-Content -Raw` 在中文 Windows 上默认按 **GBK** 解码,读 UTF-8 的 JSON 会报假的
`ConvertFrom-Json: Unrecognized escape sequence`。**文件没问题。**

```powershell
Get-Content $f -Raw -Encoding utf8      # 正确
node -e "JSON.parse(require('fs').readFileSync(p,'utf8'))"   # 最可靠
```

同理:无 BOM 的 UTF-8 `.ps1` 被 PS 5.1 按 GBK 读,**中文字符会吃掉字符串终止符**,导致假语法错误。
本项目生成的 `.ps1` 都带 BOM(`EF BB BF`)。

---

## 二、环境硬事实(2026-09-20 实测)

| 项 | 值 |
|---|---|
| DSH 版本 | `@deepseek-ai/dsh@0.1.5-rc.2`(npm 包,**无 .git**) |
| 安装位置 | `C:\Users\10766\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\` |
| DSH_HOME | `C:\Users\10766\.dsh` |
| 工作区 | `D:\新建文件夹\ai_text` |
| shell | **PowerShell 5.1**(`pwsh` 工具实际调的是 `WindowsPowerShell\v1.0\powershell.exe`) |
| Node | v24.21.0 |
| **git** | `D:\Git\cmd\git.exe`(2.55.0,**装在 D 盘**,不在 Program Files) |
| **git 代理** | `http.proxy = http://127.0.0.1:7897`(**必须**,直连 GitHub 被阻断) |
| Clash Verge | 运行中,监听 7897;但**系统代理开关是关的** |
| 平台 | Windows(桌宠的桌面窗口依赖 WPF,仅 Windows) |

### ⚠️ 两个环境陷阱

**① 当前 DSH 会话里 `git` 命令要用全路径**

DSH 在装 Git **之前**启动,继承的是旧 PATH:

```powershell
& "D:\Git\cmd\git.exe" status     # 必须这样写
```

重启 DSH 后就正常了。**不要以为 git 没装。**

**② GitHub 访问依赖代理**

```
DNS 解析 github.com   → 20.205.243.166   ✅ 正常
curl 直连             → 超时             ❌ 被阻断
经 127.0.0.1:7897     → HTTP 200         ✅ 可用
```

如果 Clash Verge 没开,git 会连不上。此时:
```powershell
& "D:\Git\cmd\git.exe" config --global --unset http.proxy
```

**注意**:用户开关 VPN 会**间歇性**影响本 Agent 的 `web_fetch` 工具——
症状是 `github.com resolves to a non-public IP address`。**先让用户关 VPN,再重试**,不要怀疑工具坏了。

**相关**:`glob`/`grep`/`pwsh` 三个工具曾**同时失效**,报 `ripgrep provider failure` 和
`spawn powershell.exe ENOENT`。真因是 `@vscode/ripgrep` 的 `rg.exe` 没被铺到包装包的 `bin/` 目录
(平台包 `@vscode/ripgrep-win32-x64` 里有)。**修法**:
```powershell
Copy-Item "$env:LOCALAPPDATA\npm-cache\_npx\<hash>\node_modules\@vscode\ripgrep-win32-x64\bin\rg.exe" `
          "$env:LOCALAPPDATA\npm-cache\_npx\<hash>\node_modules\@vscode\ripgrep\bin\rg.exe"
```
**`powershell.exe` 从来没问题**——不要因此让用户跑 DISM/SFC。

---

## 三、我犯过的错(带实测证据,请勿重复)

### 错误 1:把"文件被覆盖"当成"数据已修复"

我改了账本文件想修正金额,**13 秒后被插件自己的防抖写盘覆盖回去**。

```
我写入 20:55:12   → monthly = ¥8.58558
插件刷盘 20:55:25 → monthly = ¥35.66169   ← 用内存里的旧值覆盖
```

**教训**:运行中的进程持有内存状态,**改它的持久化文件是无效的**。要改就改**算法**(让它启动时自校验),而不是改数据。

### 错误 2:连续 4 次错误假设

排查"桌宠不自动拉起"时,我依次断定:
1. ❌ "`launchDesktopPet()` 没被调用" —— 实际调用了
2. ❌ "桌宠脚本有语法错误" —— 实际是我自己 `-Command` 引号写错
3. ❌ "`detached: true` 是唯一原因" —— 它确实是原因之一,但不解释"完全不触发"
4. ❌ "缺环境变量" —— 最小环境下也能正常启动

**真相**(一行插桩日志):
```
effect() REACHED autoLaunch-check  conf.autoLaunchDesktopPet=true  settings.autoLaunchPet=false
effect() AUTO-LAUNCH NOT SCHEDULED (condition false)
```

### 错误 3:A/B 测试设计有缺陷,结论不可信

我的第一版 A/B 测试**把上一次试验残留的心跳文件当成了新证据**(清理后心跳年龄 4~5 秒,恰好还在 6 秒判定窗口内),而 `tasklist` 显示进程数为 0——**自相矛盾**。

**正确的做法**:每次试验前**先删除心跳文件**,再 spawn,然后看它是否**重新出现**。

### 错误 4:用工具失败反推不存在的结论

`pwsh` 工具报 `spawn powershell.exe ENOENT`,我据此让用户跑 DISM/SFC 修复系统。

**实际原因**:是 `rg.exe` 缺失拖垮了 harness 的子进程通道,`powershell.exe` 从头到尾都没问题。

**可用的存在性判据**:`read` 对**存在**的文件报 `binary file`,对**不存在**的报 `not found`。
(我验证过:读 `C:\Windows\System32\WindowsPowerShell\v1.0\` 下不存在的文件报 `not found`,读 `powershell.exe` 报 `binary file`。)

### 错误 5:过度依赖被中断的工具调用

`pwsh` 调用可能返回 `tool call aborted` / 超时。**此时不要假设它没执行**——它可能已经启动了进程或完成了部分副作用。

实例:`git push` 被中断,但**认证流程已经走完**,只是推送没完成。**先核对状态再重试。**

### 错误 6:文档里写"已修复",但从未真机验证

上一轮的交接文档记录桌宠修复"已完成并验证",实际:
- 它通过的 29/29 冒烟测试用的是 `autoLaunchDesktopPet: false` —— **恰好绕开了出问题的路径**
- 备份文件里**含 `detached: true` 这个 bug**,说明真机从未成功过

**教训**:区分「验证了格式」和「验证了身份」。**证据要能证明你想证明的那件事本身。**

### 错误 7:用 `Set-Content` 改 UTF-8 文件会**吃掉 BOM**

我用 `Set-Content -Encoding utf8` 改 `dsh-plugins-repo\README.md`,`-NoNewline` 也没用——
文件从 `EF BB BF` 开头变成 `23 20`,于是 git 里**凭空多出一处改动**,看起来像有人动过文件。

**修法**（改文件后必须核对）：

```powershell
$b = [System.IO.File]::ReadAllBytes($f)
if ($b[0] -ne 0xEF) {   # 丢了 BOM
  $t = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
  [System.IO.File]::WriteAllText($f, $t, (New-Object System.Text.UTF8Encoding($true)))
}
```

`-Encoding utf8` 在 PS 5.1 **不写 BOM**，`Set-Content` 也不会保留原有 BOM。

### 错误 8:拿错的工具去验证别人的文件

审查 `dsh-context-budget` 时，我用 `node --check` 检查它的 `lib/host.js` / `lib/client.js`，
**两个都报语法错误**，一度以为文件坏了。

实际：它们是 **Cordis body**（`const` / `function` 形式，没有 `import`/`export`），
`node --check` 是**模块检查器**，对这种代码本来就会误报。

正确方式（它们自己的 `check.mjs` 就是这么做的）：

```js
new Function(source)   // 只做解析，不执行
```

**教训**：验证工具必须匹配被测对象的形态。**报错先怀疑工具，再怀疑对象。**

---

## 四、项目地图

### 交付物:插件集合仓库

```
D:\新建文件夹\ai_text\dsh-plugins-repo\     ← git 工作副本,已同步 GitHub
https://github.com/firefly-lincoln/aaa1     ← 远端
HEAD 见 git log(截至本文档更新时为 f17305e)
```

| 内容 | 说明 |
|---|---|
| `plugins/dsh-restart-plugin` | 一键重启 DSH（常驻包，有 `cordis.patch.yml`） |
| `plugins/dsh-peak-valley-plugin` | 峰谷时段与实时单价（常驻包） |
| `plugins/dsh-whale-pet-plugin-patched` | **鲸鱼娘桌宠修复版(9 项修复)**（常驻包） |
| `plugins/dsh-webguard` | 端口冲突检测(**默认不装**)（常驻包） |
| `plugins/dsh-context-budget` | **上下文预算监控 —— 动态 Cordis 插件，装法完全不同** |
| `patches/whale-pet/` | 桌宠两个成品文件 |
| `README.md` / `INSTALL.md` / `install.mjs` / `build-repo.mjs` | 文档与工具 |

#### ⚠️ 两类插件，别搞混

| | 常驻插件包（前四个） | 动态 Cordis 插件（`dsh-context-budget`） |
|---|---|---|
| 代码在哪 | `~\.dsh\profiles\web\node_modules\<pkg>` | **只在当前 DSH 进程内存里** |
| 怎么装 | `node install.mjs` | `cordis_define` 贴入 `cordis-define.json` → `cordis_run` → 界面批准客户端半 |
| 重启后 | 照常自动加载 | **消失**，需重新装 |
| 登记 | 在 `cordis.patch.yml` 与 `plugins.json` | **不要**登记进 `plugins.json` |

`dsh-context-budget` 功能：实时显示**每个对话自身**的上下文占用（与界面仪表同源），跨 20/40/60/80/100% 自动重写工作区根目录的 `上下文经验教训-<会话短id>.md`，100% 弹窗告警，并经 `agent/pre-step` 把告警注入该模型下一步输入。零模型调用、零工具注册。

**它也证明了一件事**：动态插件重启就丢，所以**仓库是它唯一的备份**——丢了就用 `cordis-define.json` 重装。

#### ⚠️ `build-repo.mjs` 有个会咬人的特性

它从 `node_modules` 重建 4 个常驻插件，并且：

1. **不会更新 `dsh-context-budget`**（已加显式检查，会在输出里列出"非构建产物目录"）
2. **会把 `README.md` / `INSTALL.md` / `LICENSE` 从暂存恢复成旧版** —— 这正是 README 的 UTF-8 BOM 曾被弄丢的机制

**所以：改完 README 若跑过构建，务必核对一次**；被回退就用
`git checkout -- README.md INSTALL.md LICENSE` 取回。


### 维护流程

```powershell
# 改了 node_modules 里的插件后
cd "D:\新建文件夹\ai_text\dsh-plugins-repo"
node build-repo.mjs          # 重建(保留 .git 与手写文档,构建后自检)
& "D:\Git\cmd\git.exe" add -A
& "D:\Git\cmd\git.exe" commit -m "..."
& "D:\Git\cmd\git.exe" push
```

> ⚠️ **不要在仓库里直接改插件代码**——下次构建会被 `node_modules` 覆盖。
> **常驻插件的代码唯一源头是 `node_modules`。**
>
> 例外：`dsh-context-budget` 与根目录文档**不在** `node_modules` 里，只能直接编辑仓库并提交。
> **改完记得核对 `git status`，确认没有意外改动。**

### 推送前：代理必须先起来

`git push` 依赖 `127.0.0.1:7897`（Clash Verge）。**实测它会被关掉**（今日遇到 3 次），症状：

```
fatal: Failed to connect to github.com:443 over proxy 127.0.0.1
```

修法（GUI 主程序不在跑，只有服务残留）：

```powershell
Start-Process "C:\Program Files\Clash Verge\clash-verge.exe" -WindowStyle Minimized
# 等端口就绪（实测 2~3 秒）
Get-NetTCPConnection -LocalPort 7897 -State Listen
```

> 直连 GitHub 是**被阻断**的（实测 curl 超时），所以不能靠"去掉代理"绕过。

### ⚠️ 另一个 AI 可能正在同一个仓库里工作

本次上传 `dsh-context-budget` 时发现：工作区里的 `prototype\`（城市应急指挥中心原型）和这个插件是**另一段对话的 AI** 做的，它**直接改了仓库里的 `README.md`**（而不是走 `build-repo.mjs`）。

**所以动手前先 `git status` 看一眼**，别把别人的未提交改动一起提交或覆盖掉。


### 桌宠修复的源文件位置

```
C:\Users\10766\.dsh\profiles\web\node_modules\dsh-whale-pet-plugin\
   lib/index.js    = 97,747 B   SHA256 820651D008D25DE0...
```

**重装 DSH 或 `pnpm update` 会覆盖它。** 真丢了:
```powershell
node "D:\新建文件夹\ai_text\dsh-plugins-repo\install.mjs" --only whale-pet
```

### 桌宠诊断第一现场(此前的文档都漏了)

```
C:\Users\10766\.whale-pet\
   whale.log                  插件运行日志(排查第一现场)
   whale-settings.json        运行时可调设置
   whale-pet-heartbeat.txt    心跳(每 2 秒更新 = 桌宠活着)
   whale-desktop-state.json   桌面宠渲染数据
   run\whale-pet.ps1          实际执行的 PowerShell 脚本
```

**注意**:这个目录在 `.dsh` **之外**,所以它躲过了那次删除事故。

### 归档(有价值,别删)

```
D:\新建文件夹\ai_text\_archive\
   credentials\.env, .credentials.yaml    ← API Key(2 把:sk-e66393***, sk-c18d12***)
   old-sessions\                          ← 5 个旧会话(4.42 MB)
   skills\persisting-cordis-plugins\      ← 从回收站抢救回来的自建 skill
   tools\scripts\                         ← 6 个工具脚本
   tools\recovered-plugin-source\session\ ← 峰谷插件 33 个版本的源文件!
   交接说明-给下一个AI.md 等 4 份文档
```

**API Key 是明文**,别外传、别提交进仓库(`.gitignore` 已排除)。

### 读会话日志的正确方法(排查利器)

会话文件**不是**"每行一个 JSON",而是 **1200+ 个拼接的 zstd 帧**。踩过两个坑：

```
① 必须先按 zstd magic (28 B5 2F FD) 切帧
② Node 的 createZstdDecompress 只解第一帧 —— 只出 400 字节
   → 必须逐帧 zstdDecompressSync 再拼接
```

解压后能看到完整对话（含 `tool/call`、`assistant/message`、`user/message` 等）。
现成脚本：工作区 `decompress-session.mjs` / `identify-sessions.mjs`。

**这招能读出分叉会话的内容** —— 已实测：从分叉 `session-d3774e32` 里认出了它的首条/末条用户消息。

---

## 五、当前状态(2026-09-22 更新)

```
DSH        : 以 Get-NetTCPConnection -LocalPort 3080 为准
本会话     : session-dfedd899-150b-43f0-9aae-b514a135daa8（已被分叉出 d3774e32）
仓库       : HEAD f17305e, 工作树干净, 100 文件, 5 个插件目录
工作区     : 约 16 MB + prototype\（另一段对话的原型游戏）与 _shot\
在线插件   : 以 ~\.dsh\profiles\web\cordis.patch.yml 为准,别靠记忆
代理       : 127.0.0.1:7897 经常是关的，推送前先确认
```

### 桌宠 9 项修复(全部已生效并真机验证)

| # | 问题 | 根因 |
|---|---|---|
| 1 | 浏览器桌宠挡屏幕,无法关闭 | 无此设置项 |
| 2 | 消耗金额虚高约 4× | 价表硬编码 `pro` 单价,实际用 `flash` |
| 3 | 周末按高峰价计费 | 只判小时不判星期 |
| 4 | 任务通知少算缓存写 | 用量快照漏 `cacheWriteTokens` |
| 5 | **「自动拉起桌面宠」永久失效** | 只在加载后读一次设置 |
| 6 | 桌宠启动后**秒退** | spawn 带了 `detached: true` |
| 7 | 「本月消耗」虚高约 4× | 历史金额是旧价「陈账」 |
| 8 | 修复 7 时月度算成 ¥0 | 恢复顺序颠倒(对空 Map 求和) |
| 9 | 浏览器操作后桌宠**掉到窗口下面** | `Topmost` 只在设置时置顶一次，后被置顶的窗口会插到更上层 |

**修复 9 的要点**：用 `SetWindowPos(HWND_TOPMOST, SWP_NOACTIVATE|NOMOVE|NOSIZE)` 每秒重申置顶。
**`SWP_NOACTIVATE` 不能省** —— 否则重申置顶会抢焦点，打断用户输入。
实测：`WS_EX_TOPMOST` 标志本来就在（`exStyle=0x80108`），所以问题不是标志丢失，
而是**置顶窗口之间的层级顺序**会被后来者插入。

**最强验证**:插件记账"今日段"= ¥2.94,**与真实余额下降 ¥2.94 完全吻合**(从 ¥39.39 降到 ¥36.45)。

---

## 六、已知限制 / 待办

1. **峰谷插件的价目表与官方文档不符**(数值约为官方的 1/4)
   - 影响范围有限:该表**只用于客户端展示**,不参与计费
   - 未擅自修改:无法确认是"旧定价"还是"不同单位口径"
   - 详见 `plugins/dsh-peak-valley-plugin/README.md`

2. **桌宠的节假日判定未纳入法定节假日**(需要日历数据),轻微高估

3. **历史金额为近似值**:重算按当前时段价格估算;高峰/空闲是逐请求累加的,历史记录只留 token 总量

4. **webguard 未安装**:如需启用,`node install.mjs --only webguard`,**且必须正常重启,不能热加载**

5. **自建 skill `persisting-cordis-plugins` 已从回收站抢救归档**:
   `_archive\skills\persisting-cordis-plugins\SKILL.md`(6,689 B)
   内容:区分「动态 Cordis 插件(重启即失)」与「常驻 profile 插件包(重启不丢)」,以及如何把丢失的动态插件从会话日志恢复成常驻包。
   如需恢复为可用 skill,拷到 `~\.dsh\skills\persisting-cordis-plugins\` 即可。

---

## 七、给后续 AI 的行动准则

1. **动手前先只读侦察** —— 别急着改
2. **改配置前必先备份**,并意识到 `patchReload: live` 会**立即生效**
3. **推理不通时先插桩**,别继续猜
4. **区分「格式对」和「内容对」**:证据要能证明你想证明的事
5. **验证要真机跑一遍**,不要只在逻辑层断言(尤其是有副作用的改动)
6. **用户很在意不要重演事故** —— 任何可能让 DSH 进程死亡的操作,**先说清楚再动手**
7. **改插件代码后必须提醒用户重启 DSH**,否则改动不生效
8. **临时脚本用完就清理**,别在工作区堆积

---

## 八、一句话交接

> 这个工作区的核心资产是 **`dsh-plugins-repo`(已同步 GitHub)** 和 **`_archive`(API Key + 旧会话)**。
> 桌宠的 9 项修复只存在于 `node_modules`,丢了就用仓库恢复。
> **`dsh-context-budget` 是动态插件，重启即失** —— 仓库是它唯一的备份。
> **改插件代码一定要重启 DSH;有副作用的插件绝不热加载;推送前先确认代理在跑。**
