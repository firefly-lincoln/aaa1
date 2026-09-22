# dsh-context-budget — 上下文预算监控

> DSH **动态 Cordis 插件**：实时显示每个对话的上下文占用，跨 20% 里程碑自动写「经验教训」文档，到 100% 弹窗告警。
> **零模型调用、零工具注册、零提示词开销。**

---

## ⚠️ 先读这一段：它和本仓库其他插件不是一类东西

| | 本仓库其他插件 | 本插件 |
|---|---|---|
| 形态 | 常驻插件包（`~/.dsh/profiles/web/node_modules/...`） | **动态 Cordis 插件**（活在当前 DSH 进程与当前会话里） |
| 安装 | `node install.mjs` | 用 `cordis_define` + `cordis_run` 贴进去 |
| 重启 DSH 后 | 还在 | **消失**，需要重新贴一次（步骤见下） |
| 是否登记进 `plugins.json` | 是 | **否**（那个清单由 `build-repo.mjs` 从 node_modules 生成，登记了也留不住，还会误导 `install.mjs`） |

`build-repo.mjs` 会自动保留「包中独有的文件」，所以本目录**能安全地留在仓库里**，重建时不会被删。

---

## 一、它做什么

| 能力 | 实现 |
|---|---|
| 实时显示**每个对话自己**的上下文占用 | 浮标就地渲染在**对话标题栏右侧**；每个对话各一个，只读自己的 `sessionId` |
| 跨 20% / 40% / 60% / 80% / 100% 写「经验教训」文档 | 整份重写工作区根目录的 `上下文经验教训-<会话短id>.md`；另外每 60 秒至少刷新一次 |
| 到 100% 弹窗提醒用户 | 右下角浮出红色告警卡片（可关闭），浮标同步变红 |
| 到 100% 提醒该对话的 AI | 通过 `agent/pre-step` 瀑布，把告警消息**注入该会话模型下一步的输入** |
| 低内存 | 状态只有几十个标量；不保留任何 DSH 活对象；单次测量实测 **1 ms** |
| **不消耗 token** | 不调用模型；**刻意不注册任何动态工具**（工具 schema 会进每一轮提示词） |

自动生成的文档长这样（节选）：

```markdown
- 当前跟随会话：`0bd20ccf`，绑定方式 `owner`，归属核实 `true`
- 轮询心跳：第 38 次于 2026-09-22 22:05:00（每 10 秒一次，这一行会持续前进）

| **占用率** | **56%**（正常） | projectedTokens ÷ 窗口，与界面仪表口径一致 |
| 预计下次请求 projectedTokens | 560,302 | 决定界面百分比的那个数 |
| 上下文节点数 | 468 | 一条消息或一段工具结果 = 1 个节点 |

3. **集中度**：最大的 8 个节点合计 94,180 tokens，占已装载的 20.6%
4. **最大单节点**：`seq=202`，13,761 tokens，占 3%。单条就吃掉 3%，属异常臃肿。
```

---

## 二、怎么装

前置：DSH 正在运行，且当前 agent 预设里有 `cordis_define` / `cordis_run` 工具（本仓库的 `cordis` 预设即自带）。

1. 打开 **`cordis-define.json`**，它的 `code.host` / `code.client` 就是两半源码。
   （也可以直接读 `lib/host.js` 与 `lib/client.js`，内容一致。）
2. 调 `cordis_define`，`plugin` 用 `{ "kind": "new", "idPrefix": "ctxbud" }`，把两个函数体分别填进 `code.host` / `code.client`。
3. 用返回的 `pluginId` / `packageId` 调 `cordis_run`，`mode: "run"`。
4. **客户端半会请求用户批准** —— 在界面上点通过。
5. **成功标志：工作区根目录出现 `上下文经验教训-<会话短id>.md`。**
   诊断显示 `running` **不代表**它在工作（见坑 1），只有文档出现才算成功。

> 改了 `lib/` 下的源码后，先跑 `node check.mjs`（语法 + 关键符号 + 反向断言），再重新 `cordis_define` 一个**新 Package**（Package 是不可变版本，不要覆盖旧的）。

---

## 三、数据从哪来（最关键的技术事实）

**唯一数据源**：DSH 进程内的 `contextPressure` 投影 —— **和界面上的「上下文仪表」是同一份数据**。

```js
ctx.get('sessionProjections').snapshot(session, ['contextPressure'])
```

界面自己的口径（读自 `dsh-client-ui-conversation`）：

```js
usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens;
percent    = Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100));
```

**实测交叉验证**（2026-09-22，本插件读数 vs DSH 自己落盘的 projcache）：

| | 插件读到 | projcache（界面数据源） |
|---|---|---|
| surfaceTokens | 116,755 | 117,176 |
| pressureTokens | 129,647 | 129,674 |
| projectedTokens | — | 560,383 → **56.04%** |
| contextWindow | 1,000,000 | 1,000,000 |

两者一致到 0.04%。**判读占用不要问模型、不要解 `.zstd`，读这个投影。**

---

## 四、架构

```
宿主半（Node 进程）                     客户端半（浏览器）
─────────────────────────              ─────────────────────────
session/event  → 轻量计数器            浮标（conversation.session.header.utilities，会话作用域）
每 10 秒 poll：                        └ 每 4 秒 host.call('status', {sessionId: 自己})
  tokenMeter.measure(sess)                → 宿主现场实测「那一个会话」
  sessionProjections.snapshot(sess)   右下角告警浮层（shell.overlay，root 作用域）
  跨档 / 每 60 秒 → 写文档              └ 跨档 toast + 100% 告警卡片
harness.handle('bind' / 'status')      归属上报（tool.view.cordis，key 'self'）
agent/pre-step → 100% 时注入告警
```

**两级轮询频率**：浮标 4 秒（只读、无副作用）；宿主文档循环 10 秒（跨档判断 + 写盘）。

**显示与绑定彻底解耦**：浮标只调 `status({sessionId})`，宿主**现场实测被点名的那一个会话**并直接返回 —— 与「宿主当前绑定哪个会话」完全无关。所以任何对话里看到的百分比，一定是那个对话自己的。

---

## 五、⚠️ 四个必须知道的坑（都是实测踩出来的）

### 坑 1：带客户端半的插件被批准后，`currentInitiator()` 拿不到会话

免批准的 Host-only 包在 `cordis_run` 的工具调用链里激活，`ctx.get('agents').currentInitiator()` **能**返回当前会话。

但**需要用户批准**的包，激活走前端 `settleUserRun`（一个 `@Remote` 方法）。读 `dsh-cordis-host-runner` 可知：`invoke()` / `settleUserRun()` **都不建立 initiator 边界**（全包只有 `dsh-agent-loop` 一处调用 `withInitiator`）。此时 `currentInitiator()` 返回 `undefined`。

> 症状极具迷惑性：`apply` 成功、诊断显示 `running`、无报错，**只是什么都不做**。

### 坑 2：`conversation.session.header.utilities` 是「显示作用域」，不是「归属作用域」

它带 `sessionId`，但**任何被挂载的会话都会上报** —— 实测用户明明在看 A 对话，B 对话（用户没在看）的槽位仍在持续上报。所以「跟随用户正在看的会话」这个信号**不可靠**，调优先级、加防抖都无效。

### 坑 3：`tool.view.cordis` 的运行卡片也会从别的对话上报

「只在本插件自己的运行卡片里渲染」这句话**不足以保证归属**：别的对话里若也有运行卡片，同样会上报。

### 坑 4（坑 2/3 的真正解药）：归属必须**可核实**，不能靠「谁先说话」

```
一个会话要成为归属会话，它的日志里必须真的存在一条
携带本 packageId 的 cordis_define / cordis_run 工具调用。
```

`cordis_run` 是在归属对话里被调用的，所以只有它的日志里有这个 packageId。这是**确定性、不依赖时序**的判据。非归属上报一律忽略。

> **教训**：当「谁先说话」无法判定归属时，不要调优先级 —— 去找一个**能被验证的事实**。

---

## 六、被实测推翻的假设（别再重走）

| 假设 | 实测结果 |
|---|---|
| 「动态宿主半里 `ctx.interval` 不触发」 | **错**。探针实测 800ms / 3000ms / 6000ms / 9000ms 全部按时刻触发 |
| 「重复覆盖写同一个文件会失败」 | **错**。连续 `fs.writeText` 五次，每次都返回 `update` |
| 「投影视图里能直接拿到 `surfaceTokens`」 | **错**。实测视图只返回 `pressureTokens` / `projectedTokens` / `contextWindow`；surface/pressure 一律以 `tokenMeter.measure()` 为准 |
| 「`position:fixed` 的浮标挂在会话槽位就等于每个对话各一个」 | **错**。渲染位置由槽位决定，但**画在哪里由 CSS 决定** —— 固定定位会让多个对话的浮标叠在同一个角落 |

---

## 七、已知限制

1. **重启 DSH 后插件消失**，必须重新 `cordis_define` + `cordis_run`。重启**不会**保留任何包。
2. **刷新浏览器页面会丢界面，但不会丢插件**。客户端半是在「运行请求被广播」时下发到页面的；刷新等于新建页面，宿主不会为已经在跑的运行重新广播。**恢复办法是对当前包再跑一次 `cordis_run`**（已批准过的不会再弹批准框）。**不要重启 DSH。**
3. **文档只写给归属会话**（也就是创建插件的那个对话）。其他对话只在头部浮标里显示实时数字。这是用「跟随可见会话」换来的确定性。
4. **`agent/pre-step` 注入路径尚未在真机上触发过**（需要占用率真的到 100%）。代码按 `dsh-repeat-tool-reminder` 的同类写法构造并全程 try/catch，失败只记录、不影响对话。
5. **停在对话里不动，百分比不会变** —— 上下文只在有新内容写入时增长。要确认插件活着，看文档里的「轮询心跳」行。
6. **一处文案不准**：文档头「触发原因」在**建立启动基线**那一次会写成「跨过 N0% 里程碑」。时间线表格本身是对的（显示为「启动基线」）。
7. **每次重新激活都会重建基线**，所以时间线里会出现多条「启动基线」—— 这实际上是重启历史。

---

## 八、文件清单

| 文件 | 说明 |
|---|---|
| `lib/host.js` | 宿主半函数体（纯 JavaScript，无 import / TS / JSX） |
| `lib/client.js` | 客户端半函数体（用 `React.createElement`，无 JSX） |
| `cordis-define.json` | **可直接使用的 `cordis_define` 参数**（含两半源码的转义形式） |
| `check.mjs` | 自检：语法 + 关键符号 + 反向断言。`node check.mjs` |
| `CHANGELOG.md` | 版本史 v1→v9，含每个版本踩的坑 |
| `README.md` | 本文档 |

---

## 九、许可

与仓库其余部分一致。插件源码由本仓库作者编写，可自由使用与修改。
