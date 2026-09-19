# 来源与改动说明（第三方插件修改版）

本目录**不是原创作品**，而是第三方开源插件的**本地修改版**再分发。

## 上游

| 项目 | 信息 |
| --- | --- |
| 插件名 | `dsh-whale-pet-plugin`（鲸鱼娘桌宠） |
| 版本基线 | `1.0.4-new` |
| 原作者 | **dleaf6211-hash**（npm 维护者 `dleaf <1833242849@qq.com>`） |
| 上游仓库 | https://github.com/dleaf6211-hash/dsh-whale-pet |
| npm 包 | https://www.npmjs.com/package/dsh-whale-pet-plugin |
| 许可证 | **MIT**，`Copyright (c) 2026 dleaf6211-hash` |

原作者的 `LICENSE` 文件与版权声明已**原样保留**在本目录中，未做任何改动。
MIT 许可允许修改与再分发，前提是保留版权声明与许可文本——即本文件与 `LICENSE` 存在的原因。

## 本地改动（相对上游 `1.0.4-new` 官方发布包）

逐字节比对结果：**82 个文件中，仅 2 个文件被改动**，其余 63 个与上游完全一致（另有仓库新增的说明文件）。

| 文件 | 上游 | 本地 | 说明 |
| --- | --- | --- | --- |
| `lib/index.js` | 91,356 B | 91,702 B | **+4 行**：新增 `browserPetEnabled` 设置项 |
| `client/client.js` | 43,148 B | 44,214 B | **+20 行 / 改 3 行**：新增「浏览器桌宠显隐」功能 |

### 改动内容：新增「浏览器桌宠显隐」

上游只能在设置里调整桌宠大小等，无法隐藏浏览器里的桌宠。本修改新增了一个开关：

- **宿主半边 `lib/index.js`**：把 `browserPetEnabled` 加进默认设置、设置加载/合并逻辑、设置保存补丁逻辑，以及设置命名空间 schema：
  `svc.register('dsh-whale-pet', z.object({ petScale: …, browserPetEnabled: z.boolean().default(true) }))`
- **浏览器半边 `client/client.js`**：新增 `applyBrowserPetVisibility()`，
  - 关闭时把桌宠**根节点从文档流里移除**（`rootEl.remove()`），而不是 `display:none`——避免那层透明浮层继续遮挡页面点击；
  - 重新开启时按原顺序 `append` 回去；
  - 挂载时、以及设置变更时都会调用；
  - 设置面板新增一行开关「浏览器桌宠」，并更新了保存提示文案。

桌面宠（独立的 PowerShell 窗口）不受该开关影响；关闭状态下浏览器半边仍继续加载资产与轮询，便于随时切回。

## 如何应用 / 回退

- 应用：把本目录放进 DSH profile（见仓库根 `README.md`），或在官方包基础上只替换上述两个文件。
- 回退：直接使用上游 `dsh-whale-pet-plugin@1.0.4-new`。

## 联系

如果你是本插件的原作者，对这个修改版再分发有异议，请提 issue，我会立刻移除本目录。
