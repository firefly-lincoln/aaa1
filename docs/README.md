# 文档索引

本目录是从工作区同步过来的**交接文档**，供接手这个项目的人（或 AI）快速建立上下文。

| 文档 | 讲什么 |
|---|---|
| [`HANDOVER.md`](HANDOVER.md) | **本仓库相关**：DSH 插件开发与维护的完整交接说明。含 6 条铁律、8 类已犯错误、环境硬事实、项目地图。**第一次接手请先读这份。** |
| [`HANDOVER-game-prototype.md`](HANDOVER-game-prototype.md) | `prototype/` 里的城市应急指挥游戏原型（93 轮开发）。与插件仓库无关，但同一工作区。 |
| [`HOWTO-read-session-usage.md`](HOWTO-read-session-usage.md) | 工具文档：怎么读 DSH 会话的 token 用量与会话内容（多帧 zstd 解压那套）。 |

---

## ⚠️ 两份副本，以谁为准

这些文档在**两处**存在：

| 位置 | 角色 |
|---|---|
| `D:\新建文件夹\ai_text\*.md` | **工作副本** —— 实际工作中被编辑的那份 |
| `dsh-plugins-repo\docs\*.md` | **版本控制副本** —— 本目录，有 git 历史 |

**同步方式**：在工作区改完后，重新复制覆盖本目录：

```powershell
$root = "D:\新建文件夹\ai_text"
$docs = "$root\dsh-plugins-repo\docs"
Copy-Item "$root\交接说明-给下一个AI.md"   "$docs\HANDOVER.md" -Force
Copy-Item "$root\交接说明-游戏原型.md"     "$docs\HANDOVER-game-prototype.md" -Force
Copy-Item "$root\读取DSH上下文用量-方法.md" "$docs\HOWTO-read-session-usage.md" -Force
```

然后 `git add -A && git commit && git push`。

> **不做自动同步**是有意的：这些文档改动频繁，自动同步会在提交里制造噪音。
> 判断标准很简单 —— **如果你希望这次改动被版本控制记住，就复制过去。**

---

## 相关文档（不在本目录）

以下文档留在工作区，因为它们是**运行时产物**或**单次工作的记录**，不适合进公开仓库：

| 文档 | 为什么不在仓库里 |
|---|---|
| `上下文经验教训-<会话短id>.md` | 由动态插件 `dsh-context-budget` 自动生成，每次刷新整份覆盖 |
| `上下文预算插件-说明.md` | 对应插件的说明，已随插件放在 `plugins/dsh-context-budget/README.md` |
| `游戏设计-*.md` | 具体设计稿，随游戏原型演进 |
| `会话恢复记录.md` / `插件恢复与桌宠验证记录.md` / `桌宠自动调起Bug-分析报告.md` | 单次事故与修复的过程记录 |

---

## 这个仓库还讲了什么

除了文档，本仓库的主要价值是**五个插件**（四个常驻包 + 一个动态插件）以及桌宠的 **9 项实测修复**。
细节见仓库根 [`README.md`](../README.md) 与
[`plugins/dsh-whale-pet-plugin-patched/PATCH-NOTES.md`](../plugins/dsh-whale-pet-plugin-patched/PATCH-NOTES.md)。
