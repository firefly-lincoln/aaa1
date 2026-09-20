# 鲸鱼娘桌宠 · 修复版说明

**上游**：[dleaf6211-hash/dsh-whale-pet](https://github.com/dleaf6211-hash/dsh-whale-pet) · npm `dsh-whale-pet-plugin`
**基线版本**：`1.0.4-new`
**许可**：MIT，Copyright (c) 2026 dleaf6211-hash（见同目录 `LICENSE`）

本目录是**修改版**。上游的 `README.md` / `CHANGELOG.md` / `LICENSE` 全部原样保留，本文档只说明改了哪里、为什么改、怎么验证。

改动只落在两个文件：

```
lib/index.js        宿主侧（Node）
client/client.js    浏览器侧（前端）
```

---

## 改动总览

| # | 现象 | 根因 | 改动 |
|---|---|---|---|
| 1 | 浏览器桌宠挡屏幕且关不掉 | 无此设置项 | 新增 `browserPetEnabled` |
| 2 | 消耗金额虚高约 4× | 价表写死 `pro` 单价 | 按模型选价 |
| 3 | 周末按高峰价计费 | 只判小时不判星期 | 加星期判断 |
| 4 | 任务通知少算缓存写 | 快照漏 `cacheWriteTokens` | 补齐字段 |
| 5 | 自动拉起桌面宠永久失效 | 只在加载后读一次设置 | 抽出 `maybeAutoLaunch()` 双路径复用 |
| 6 | 桌宠启动后秒退 | `detached: true` | 移除该参数 |
| 7 | 本月消耗虚高约 4× | 历史金额是旧价「陈账」 | 启动自校验重算 |
| 8 | 修复 7 导致月度算成 ¥0 | 恢复顺序颠倒 | 调整启动顺序 |

---

## 1. 新增「浏览器桌宠」开关

**问题**：浏览器里的鲸鱼娘悬浮在页面上，会挡住内容，而设置里只有「浏览器宠大小」，没有开关。（桌面宠有「透明」模式，不受影响。）

**改动**：

- `DEFAULT_SETTINGS` 增加 `browserPetEnabled: true`
- `loadSettings()` / `saveSettings()` 的**白名单**各加一条
- `client.js` 增加 `applyBrowserPetVisibility()`，并在 `mount()` 与状态轮询中调用
- 设置卡新增开关行

**踩过的坑**：宿主不是对象合并，而是**逐字段白名单赋值**：

```js
if (typeof patch.voiceEnabled === 'boolean') s.voiceEnabled = patch.voiceEnabled
```

只加 UI 开关而不动这两个函数，**点击后值会被静默丢弃**。`loadSettings` 和 `saveSettings` **两处都要加**，漏一处就是「存得下但读不回」。

**关闭时是从文档移除节点**（`rootEl.remove()`）而不是 `display:none`——透明遮罩层用 `display:none` 仍可能挡住点击。

---

## 2. 按模型选价（金额虚高约 4 倍）

**问题**：木牌的消耗金额比真实扣款高约 4 倍。

**根因**：价表写死了 `deepseek-v4-pro` 的单价，而 DSH 默认跑的是 `deepseek-flash`。

官方定价（[api-docs.deepseek.com](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)，元/百万 tokens）：

| | flash 空闲 | flash 高峰 | pro 空闲 | pro 高峰 |
|---|---|---|---|---|
| 输入（缓存命中） | 0.02 | 0.04 | 0.15 | 0.30 |
| 输入（未命中） | 1 | 2 | 4.5 | 9.0 |
| 输出 | 4 | 8 | 13.5 | 27.0 |

原实现对所有模型套用 pro 价 → 输入 **4.5×**、输出 **3.4×**、缓存命中 **7.5×**。

而缓存命中占全部输入的 **97.9%**，所以第 3 行是重灾区。

**改动**：`PRICE` → `PRICE_TABLE`（含 flash / pro 两档），新增 `resolvePriceKey(model)`，`costOf()` 增加 `model` 参数；模型在**每次流开始时确定**，保证同一次响应内单价一致（原来每个 chunk 重新取时段，跨 12:00 的响应会被劈成两种价）。

**实测**（用户真实数据）：

```
                  改前        改后
当前会话          ¥2.17765 → ¥0.3708
session-1e6df948  ¥12.12706 → ¥2.5813
session-4e3e62a8  ¥18.54593 → ¥3.6203
```

---

## 3. 周末不再算高峰

官方口径：**周一至周五（不含法定节假日）9:00–12:00、14:00–18:00** 为高峰。

原实现只判断小时：

```js
if ((h >= 9 && h < 12) || (h >= 14 && h < 18)) return PRICE.peak
```

→ 周六周日的这些时段也被算成高峰价。已加 `getDay()` 判断。

> **已知限制**：中国法定节假日仍未识别（需要日历数据），节假日会被按工作日计价，轻微高估。

---

## 4. 任务通知补齐缓存写

`usageSnapshot()` 原本只快照 3 个字段：

```js
return { input: ..., output: ..., cacheRead: ... }   // 缺 cacheWrite
```

导致 `takeDeltaFrom()` 的差值里 `cacheWrite` 恒为 0，任务完成通知少算这部分费用。已补进快照与差值。

---

## 5. 自动拉起桌面宠永久失效（最影响体验的一个）

**现象**：设置里「自动拉起桌面宠」是开着的，但重启 DSH 后桌宠从不自动出现，只能手动点木牌拉起。

**根因**，一行日志定案：

```
effect() REACHED autoLaunch-check  conf.autoLaunchDesktopPet=true  settings.autoLaunchPet=false
effect() AUTO-LAUNCH NOT SCHEDULED (condition false)
```

原实现**只在插件加载后读一次设置**：

```js
if (conf.autoLaunchDesktopPet === true && state.settings.autoLaunchPet !== false) {
  petTimer = setTimeout(() => { launchDesktopPet() }, 5000)
}
```

于是形成死结：

| 时刻 | 事件 | 结果 |
|---|---|---|
| 启动时 | 开关是**关**的 | 定时器不调度 |
| 用户随后打开开关 | 文件写入 `true` | **运行中的插件不会重新调度** |
| 之后 | 内存/磁盘都是 `true` | 定时器早已错过唯一时机 |

**改动**：判定抽成 `maybeAutoLaunch()`，**启动调度**与**设置变更**两条路径复用：

```js
function maybeAutoLaunch() {
  if (conf.autoLaunchDesktopPet !== true) return
  if (state.settings.autoLaunchPet === false) return
  if (state.petAlive) return          // 已在运行,不重复拉起
  launchDesktopPet().catch(() => {})
}
```

```js
// saveSettings() 内:开关一改就重新评估(300ms 去抖)
if (patch && patch.autoLaunchPet !== undefined && autoLaunchHolder.fn !== null) {
  setTimeout(() => { try { autoLaunchHolder.fn() } catch (e) {} }, 300)
}
```

副作用是**开关现在即时生效**，不必等下次重启。

---

## 6. 桌宠启动后秒退（`detached: true`）

**⚠️ 这一条是修复过程中我们自己引入的 bug，写在这里避免重蹈覆辙。**

为了让桌宠生命周期独立于 DSH，曾在 `spawn` 时加了 `detached: true` + `child.unref()`。结果 **WPF 桌宠在分离模式下瞬间退出**（exit code 0，无任何输出）。

严格 A/B 实测（每次先删心跳文件再判据）：

```
A  stdio:ignore + windowsHide            → 心跳 0.4s 出现   ✅
B  A + detached:true                     → 进程 0.2s 退出   ❌
C  pipe stdio                            → 心跳 0.6s 出现   ✅
```

**结论：不要加 `detached: true`。** 代码里已留警告注释：

```js
// ⚠️ 不要加 detached:true —— A/B 实测:detached 下 WPF 桌宠会瞬间退出(code=0,无心跳),
// 非 detached 则 0.4s 内正常起来。桌宠必须作为普通子进程启动。
spawn(..., { stdio: 'ignore', windowsHide: true })
```

### 顺带加的「验证式拉起」

原实现 `spawn` 后立刻 `state.petAlive = true`，**从不校验宠物是否真的起来了**，所以失败时是静默的。

现在 `launchDesktopPet()` 会：

1. 杀掉旧实例后，**轮询心跳最多 6 秒**确认它真的退出（桌宠用全局具名互斥体 `WhalePetMutex` 防重复，旧实例没死透时新实例会静默 `exit`）
2. 删除上一实例的残留心跳文件（避免把「旧的还活着」误判成「新的起来了」）
3. `spawn` 后**等新实例写出心跳**（最多 8 秒）
4. 失败则**重试 3 轮**，每轮重新清理
5. 3 轮都失败 → `petAlive = false` 并写明确的 `pet launch FAIL` 日志，**不再谎报成功**

正是这套校验在第一时间抓出了第 6 条的 bug。

---

## 7 + 8. 本月消耗虚高（陈账）与随之而来的顺序坑

**现象**：「当前会话消耗」合理，但「本月消耗」高得离谱（¥35.66，而真实余额当天只降了 ¥2.85）。

**根因**：`monthlyUsage.costCny` 由各会话金额求和而来，而那些**历史会话的金额是旧价表时代累加完成的**，写盘后再也不会被重算。修好价表只影响**此后新增**的累加。

**改动**：不修补数据，而是**让算法自愈**。

```js
// restoreSessionCosts() 内
// 自校验:写盘值可能是旧价表算的(改价/换模型后即成陈账),token 数才是权威。
costCny: costOf(inp, outp, cr, cw, state.usage.lastModel)
```

```js
/** 月度消耗 = 各会话成本之和(自校验后重新求和) */
function recomputeMonthlyCost() {
  let total = 0
  state.sessionCosts.forEach((e) => { total += e.costCny })
  state.monthlyUsage.costCny = Math.round(total * 100000) / 100000
}
```

**⚠️ 千万不要在运行中的 DSH 里直接改账本文件。** 我们试过——插件有防抖写盘 `schedulePersistCosts()`，13 秒后就用内存里的旧值把文件覆盖回去了。

**修复 8（自愈引入的坑）**：`recomputeMonthlyCost()` 要对会话账本求和，但启动顺序原本是「先月度、后会话」：

```
restoreMonthlyUsage()   ← 此时 sessionCosts 还是空 Map → 求和 = ¥0
restoreSessionCosts()   ← 账本在这之后才填充
```

已调整顺序并加注释：

```js
// 会话账本必须先于月度恢复:recomputeMonthlyCost() 要对已自校验的账本求和,
// 顺序颠倒会因 sessionCosts 尚为空 Map 而把月度金额算成 0
restoreSessionCosts()
restoreMonthlyUsage()
```

**验证**（三重交叉）：

| 校验 | 结果 |
|---|---|
| 会话合计 == 月度值 | ✅ ¥8.76465 == ¥8.76465 |
| tokens 三口径（usage / monthly / 会话求和） | ✅ 全部相等 |
| **与真实余额对照** | ✅ 插件记「今日段」¥2.94 == 实际下降 ¥2.94（39.39 → 36.45） |

> **精度说明**：重算按**当前时段价格**估算历史会话，所以是近似值。高峰/空闲是**逐请求**累加的，历史记录只留 token 总量，信息不足以精确还原。金额会落在「全空闲 ~ 全高峰」区间内，量级正确。

---

## 已知限制

1. **法定节假日**未纳入峰谷判定（缺日历数据，轻微高估）
2. **历史金额为近似值**（原因见上）
3. **桌面宠仅 Windows**（依赖 WPF）
4. 上游若发布新版本，本修复版需重新对齐——建议保留 `patches/` 里的成品文件作为参照

---

## 如何验证修复在位

```powershell
$f = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-whale-pet-plugin\lib\index.js"

# 逐项断言
(Select-String $f -Pattern 'browserPetEnabled'     ).Count   # ≥ 4
(Select-String $f -Pattern 'PRICE_TABLE'           ).Count   # ≥ 2
(Select-String $f -Pattern 'isPeakNow'             ).Count   # ≥ 2
(Select-String $f -Pattern 'recomputeMonthlyCost'  ).Count   # ≥ 3
(Select-String $f -Pattern 'maybeAutoLaunch'       ).Count   # ≥ 4
(Select-String $f -Pattern 'detached: true'        ).Count   # == 0（只允许出现在注释里）

# 语法
node --check $f
```

运行中的实例是否已加载修复：**重启 DSH**（见主 README 第 1 条硬知识——`patchReload: live` 不重载插件源码）。
