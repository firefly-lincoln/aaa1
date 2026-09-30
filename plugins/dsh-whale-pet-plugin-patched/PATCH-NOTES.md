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
| 9 | 浏览器操作后桌宠**掉到窗口下面** | `Topmost` 只请求一次，后被置顶的窗口会插到更上层 | `SetWindowPos(HWND_TOPMOST)` 每秒重申 |
| 10 | DSH 0.1.7 后**设置卡消失**（找不到桌宠设置） | 设置槽位从 `settings.plugin.item` 改名为 `settings.plugins.tab` | 改用新槽位注册 |
| 11 | 桌宠挡屏幕，**无法调大小** | 桌面宠尺寸全硬编码（`petScale` 只管浏览器宠） | 新增「桌面宠大小」设置 |

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

## 9. 桌宠被压在其它窗口下面（置顶失效）

**现象**：在浏览器里操作一段时间后（切标签、全屏、弹窗），桌宠掉到窗口下层，必须回到桌面点一下才重新浮到最上面。

**根因**：WPF 的 `Topmost = $true` 只是**在设置时置顶一次**，不会持续维持。实测（2026-09-21）窗口的 `WS_EX_TOPMOST`（`0x8`）标志**从一开始就在**（`exStyle = 0x80108`）——所以问题**不在标志丢失**，而在于：

> **置顶窗口之间存在层级顺序。** 任何后来置顶的窗口（浏览器全屏、模态弹窗等）会插入到更上层，把桌宠压下去。而原脚本设完 `Topmost` 后再无任何保障。

原脚本只有一个 2 秒的 UI 刷新计时器和 150ms 的眼睛悬停计时器，**没有任何"保持置顶"的逻辑**。

**改动**——四处（均在 `buildPetScript` 的模板里）：

| 位置 | 改动 |
|---|---|
| P/Invoke 声明 | 增加 `SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags)` |
| 新增函数 | `Set-Topmost`：补 `WS_EX_TOPMOST` 样式 + `SetWindowPos(HWND_TOPMOST, SWP_NOACTIVATE\|SWP_NOMOVE\|SWP_NOSIZE)` |
| 新增计时器 | `$topmostTimer`，**每 1 秒**重申一次 |
| 关闭清理 | `$win.Add_Closed` 里 `$topmostTimer.Stop()` |

```powershell
function Set-Topmost {
  if ($script:hwnd -eq $null) { return }
  try {
    $ex = [W]::GetWindowLong($script:hwnd, -20)
    if (($ex -band 0x8) -eq 0) { [void][W]::SetWindowLong($script:hwnd, -20, $ex -bor 0x8) }
    # HWND_TOPMOST=-1, SWP_NOSIZE=1|SWP_NOMOVE=2|SWP_NOACTIVATE=0x10
    [void][W]::SetWindowPos($script:hwnd, [IntPtr]::new(-1), 0, 0, 0, 0, 0x13)
  } catch { }
}
```

**⚠️ `SWP_NOACTIVATE` 不能省**：重申置顶时若把焦点抢过来，用户每次输入都会被桌宠打断——那比被遮挡更糟。

**运行时实测**（真实窗口 + 真实 P/Invoke）：

```
Add-Type OK
SetWindowPos returned True          ← 签名正确
连续 5 次调用 failures=0            ← 幂等，可循环调用
0x13 含 SWP_NOACTIVATE(0x10)? True   ← 不抢焦点
0x13 含 NOMOVE+NOSIZE? True          ← 不动位置与大小
```

**验证修复在位**：

```powershell
Select-String -Path "$env:USERPROFILE\.whale-pet\run\whale-pet.ps1" -Pattern 'Set-Topmost'
```

生成的脚本从 34,714 B 增至 **35,907 B**；出现 `Set-Topmost` / `topmostTimer` / `SetWindowPos` / `0x13` 即为已生效。

---

## 10. DSH 0.1.7 升级后设置卡消失

**现象**：DSH 升到 `0.1.7-rc.2` 后，设置界面里**找不到「鲸鱼娘桌宠」这一项**。
桌宠本体正常（余额/用量/效率照常显示），只是**配置入口没了**。

**根因**：0.1.7 重排了设置界面，**插件设置卡所在的槽位改名了**：

```
0.1.5 ~ 0.1.6 :  settings.plugin.item     ← 旧名
0.1.7+        :  settings.plugins.tab     ← 新名
```

桌宠的客户端仍注册到旧名，于是卡片被注册进一个**没有任何人渲染的槽位** —— 无声消失。

**为什么完全查不到线索**：

```js
} catch (e) { /* 注册失败绝不让 GUI 启动崩掉 */ }
```

整个注册被 `try/catch` 包住，失败不留任何痕迹。更麻烦的是它自己的**探针也在查旧槽位**：

```js
var entries = slots.entries('settings.plugin.item')   // 旧名
console.log('... settings card registered ...')       // 于是可能打印"成功"
```

**排查证据链**（四道独立确认）：

| # | 检查 | 结果 |
|---|---|---|
| 1 | 0.1.7 全库搜 `plugin.item` | 0 命中 |
| 2 | 桌宠 client 里新/旧槽位名 | 新 0 次 / 旧 3 次 |
| 3 | 是否存在向后兼容别名 | 无 |
| 4 | `settings.plugins.tab` 的必需字段 | 仅 `id` 必填，其余 optional |

权威槽位清单可从 `dsh-cordis-client-runner/lib/client.js` 的契约表读出
（搜 `key: "settings.`）：0.1.7 里 `settings.plugin.item` **不存在**。

**改动**（`client/client.js` 一处 + 探针一处）：

```js
// 旧
slots.inject('settings.plugin.item', function () {
  return slots.register(
    { name: 'settings.plugin.item', id: 'dsh-whale-pet-plugin', order: 40,
      label: '鲸鱼娘桌宠', key: 'dsh-whale-pet' },
    function () { return makeSettingsCardElement() }
  )
})

// 新
slots.inject('settings.plugins.tab', function () {
  return slots.register(
    { name: 'settings.plugins.tab', id: 'whale-pet', order: 40,
      label: function () { return '鲸鱼娘桌宠' } },
    function () { return makeSettingsCardElement() }
  )
})
```

三个要点：

1. **`id` 用自有值 `'whale-pet'`** —— `'all'` 是官方只读清单占用的 id（`client-ui-settings-plugin-inventory`），复用会顶掉它
2. **`label` 改成 thunk** —— 官方契约标注 `string | (() => string)`，thunk 每次投影重读，能跟随界面语言
3. **组件函数不用动** —— 新槽位的 `register(at, component)` 第二个参数本来就是"组件工厂"，原写法合规

**不需要改宿主**：`lib/index.js` 里向 `settingsScope` 认领 namespace 的那段在 0.1.7 仍有效
（日志可见 `settings-bridge: claimed namespace dsh-whale-pet; describe sees it = true`），
仅更正了一处过时注释。

**验证修复在位**：

```powershell
Select-String -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-whale-pet-plugin\client\client.js" `
  -Pattern "settings\.plugins\.tab"
```

客户端 bundle **不会热加载**，改完**必须重启 DSH**。
重启后浏览器控制台应出现：

```
[whale-pet] settings card registered; slot entries = N, ours present = true
```

文件从 44,214 B 增至 **44,851 B**。

---

## 11. 新增「桌面宠大小」设置（可手动缩放）

**需求**：虚化后桌宠仍可能挡屏幕，希望能手动调小（也能调大）。

**背景**：设置里原本只有 **`petScale`，那是浏览器宠的**（`rootEl.style.transform = 'scale(...)'`），
桌面宠（WPF 窗口）的尺寸全是硬编码，**完全没有缩放能力**。所以这是新增功能而非修 bug。

**改动**（4 个文件）：

| 文件 | 改动 |
|---|---|
| `lib/index.js` | 设置项 `desktopPetScale`（默认 1.0，夹取 0.5~1.6）；视觉树尺寸参数化；注入 `S()` 与 `Set-UIScale()`；`Loaded` 时套用 `LayoutTransform`；`Update-UI` 里每 2 秒检测设置变化 |
| `lib/pet-views.js` | `Set-WinHeight` 改为按测量尺寸；`$big/$rm/$warn` 的宽高与字号参数化 |
| `client/client.js` | 设置卡新增「桌面宠大小」滑块（50%~160%） |
| `whale-pet.ps1`（生成物） | 桌面宠**每次刷新时重读** `whale-settings.json`，所以拖滑块约 2 秒后自动跟随，**不用重启桌宠** |

**三个关键设计点（都是实测逼出来的）**：

**① 尺寸不能用「基准值 × 缩放」估算 —— 放大时会裁掉内容**

```
LayoutTransform 放大的是【测量值】，不是线性缩放:
  scale=1.25  窗口 313x425  内容需要 312x472   → 裁掉 47px
  scale=1.6   窗口 400x544  内容需要 512x720   → 裁掉 176px
```

改为用 `Measure()` 量出**缩放后的真实内容尺寸**再撑开窗口：

```powershell
$script:root.Measure((New-Object System.Windows.Size(([double]$win.Width), [double]::PositiveInfinity)))
$win.Height = [double]$script:root.DesiredSize.Height
```

> 可用宽度必须传**实际窗口宽度**：传 `PositiveInfinity` 会让文本按单行测量，高度被低估。

**② 必须用 `LayoutTransform`，不能用 `RenderTransform`**

后者是**位图缩放**，放大后文字和图片会糊。

**③ `$script:` 后面不能跟函数调用**

```powershell
$script:S(20)    # 无效语法：Unexpected token '('
S(20)            # 正确（函数本就是脚本作用域，裸名即可）
```

同理，函数调用塞进构造器参数时要加括号（参数模式不认）：

```powershell
New-Object System.Windows.Thickness(0, S(4), 0, 0)      # 错
New-Object System.Windows.Thickness(0, (S(4)), 0, 0)    # 对
```

**真机实测**（脚本 `_archive/tools/test-petscale*.ps1` 同款做法）：

```
设置   期望 W     实测窗口        判断
0.5    125        125x93          OK
0.75   188        187x167         OK
1.0    250        250x306         OK
1.25   312        313x429         OK
1.5    375        375x640         OK
1.6    400        400x706         OK     ← 高度随内容增长，不被裁

0.2（越界下限）-> 回退 1.0 -> 250x306   ✅
2.5（越界上限）-> 回退 1.0 -> 250x306   ✅
1.2            -> 300x425 = 250×1.2      ✅
```

**最后一项（1.2）没有重启桌宠**，窗口自己变了 → 证实 2 秒实时跟随有效。

> ⚠️ 越界值是**回退到 1.0**（不是夹到边界）。直接改 `whale-settings.json` 时是这个行为；
> 走设置卡滑块则受 `min/max` 限制，本来就到不了越界值。

**文件变化**：`lib/index.js` 99,109 → **104,444 B**；`lib/pet-views.js` 30,380 B（本项开始纳入 patches）；
`client/client.js` 44,851 → **45,662 B**。

**验证修复在位**：

```powershell
Select-String -Path "$env:USERPROFILE\.whale-pet\run\whale-pet.ps1" -Pattern 'function Set-UIScale','function Read-UiScale'
```

生成脚本约 **41,600 B**（含 `Set-UIScale` 2 处 / `Read-UiScale` 4 处 / `S(196)` 9 处）。

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
