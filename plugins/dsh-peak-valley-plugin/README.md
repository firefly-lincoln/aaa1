# dsh-peak-valley-plugin

在对话输入框下方挂一行**峰谷电价指示器**：当前处于高峰还是空闲时段、距离下次切换还有多久，以及当天的节假日状态。

---

## 功能

### 1. 峰谷时段实时判定

DeepSeek 的计费分高峰与空闲两档，**空闲价是高峰价的一半**：

| 时段 | 判定 |
|---|---|
| **高峰** | 周一至周五（不含法定节假日）**9:00–12:00、14:00–18:00** |
| **空闲** | 其余全部时间（含周末与法定节假日全天） |

源码里的实现是 UTC 口径，换算后与北京时间的官方口径一致：

```js
const PEAK_WINDOWS = [[1, 4], [6, 10]]   // UTC 1–4 点、6–10 点 → 北京 9–12、14–18
```

### 2. 节假日日历

内置 **2026 年国务院办公厅节假日安排**作为基准（已与官方原文逐条比对）：

```js
const SEED_HOLIDAYS = [
  { name: '元旦',   start: '2026-01-01', end: '2026-01-03' },
  { name: '春节',   start: '2026-02-15', end: '2026-02-23' },
  { name: '清明节', start: '2026-04-04', end: '2026-04-06' },
  { name: '劳动节', start: '2026-05-01', end: '2026-05-05' },
  { name: '端午节', start: '2026-06-19', end: '2026-06-21' },
  { name: '中秋节', start: '2026-09-25', end: '2026-09-27' },
  { name: '国庆节', start: '2026-10-01', end: '2026-10-07' },
]
```

节假日会被正确判为**空闲时段**（不按工作日计价）。日历还有一套在线刷新机制，缓存落在 `~/.dsh-peak-valley.json`，7 天刷新窗口、3 天最大缓存龄。

### 3. 价格面板

`snapshot` handler 会返回两个模型的单价，由浏览器半边渲染成输入框下方的价格行。

---

## 路由

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/dsh-peak-valley/snapshot` | POST | 完整快照：峰谷状态、下次切换时间、节假日日历、价格表 |

响应示例（字段节选）：

```json
{
  "peak": false,
  "tariff": "off-peak",
  "nextChangeAt": 1789900000000,
  "pricing": { "source": "api-docs.deepseek.com/quick_start/pricing", "verifiedAt": "2026-09-19", "models": { ... } },
  "holidays": [ ... ]
}
```

---

## ⚠️ 已知限制：价格表可能过时

插件内置的单价与**当前官方定价页不一致**，请以官方页面为准。

对照（元/百万 tokens，空闲档）：

| 模型 | 维度 | 插件内置 | 官方页面（2026-09 核对） |
|---|---|---|---|
| deepseek-flash | 缓存命中 | 0.003 | **0.02** |
| | 缓存未命中 | 0.15 | **1** |
| | 输出 | 0.6 | **4** |
| deepseek-v4-pro | 缓存命中 | 0.022 | **0.15** |
| | 缓存未命中 | 0.66 | **4.5** |
| | 输出 | 1.98 | **13.5** |

**影响范围有限**：这张表**只用于客户端展示**，不参与任何计费或扣款计算。峰谷时段与节假日的判定逻辑是独立且正确的。

**为什么不直接改掉**：无法确认这些数字是「旧版定价」、「不同单位口径」还是「另一种计价快照」——贸然改成官方值，反而可能把一份**本来正确、只是口径不同**的表改坏。所以保留原值，仅在此标注。

> 如果你确认了正确口径，改 `lib/core.js` 第 11 行的 `PRICING` 即可。

---

## 技术说明

这个插件是**从动态 Cordis 插件「再宿主化」**而来的常驻版本，`lib/core.js` 是由 `tools/build-permanent-plugin.mjs` 从原动态包生成的（文件头注明 **Do not hand-edit: regenerate instead**）。

宿主半边 `lib/index.js` 提供两样东西补齐动态沙箱原本注入的能力：

- **`harness.handle(name, handler)`** —— 每个注册的 handler 变成 `POST /api/dsh-peak-valley/<name>`，替代原先包内私有的 RPC
- **`ctx.get('fs')`** —— 真实的 `node:fs` 适配器。沙箱化文件系统曾以 `file access denied under workspace-write mode` 拒绝日历缓存写入，导致每次启动都重新抓取政府日历；换成 `node:fs` 后缓存才真正生效

---

## 安装位置

```
%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-peak-valley-plugin\
%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml     ← 一条 insert
```

## 卸载

1. 从 `cordis.patch.yml` 删除对应 `insert` 行
2. 删除 `node_modules\dsh-peak-valley-plugin`
3. 重启 DSH

---

## 许可

MIT（见仓库根 `LICENSE`）
