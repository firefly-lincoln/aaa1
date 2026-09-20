# DSH 插件集合（含桌宠修复版）

给 [DeepSeek Harness (DSH)](https://deepseek-harness.github.io/deepseek-harness/guide/quickstart) 用的插件集合，附带一份经过实测修复的**鲸鱼娘桌宠**修改版。

所有内容都来自一台真实在用的 DSH 实例，并且每处修复都有**实测证据**（A/B 对比、日志、余额对账），不是推测。

---

## 📦 插件一览

四个插件，各自独立、可单独安装。**全部安装在 `plugins/` 下**。

### 1. `plugins/dsh-restart-plugin` — 一键重启 DSH

在「设置 → 通用」里加一行 **重启 DSH**，点一下就把 DSH 进程重启好，不用关终端、不用重开浏览器。

浏览器轮询 `/api/dsh-restart/ping`，等新进程报出新的 `bootId` 后自动刷新页面。

> 实现要点：DSH 为受管子进程建了带 `KILL_ON_JOB_CLOSE` 的 Job Object，所以它直接用 Node 的 `child_process` 起一个**分离助手**，让替代进程能活过 DSH。

### 2. `plugins/dsh-peak-valley-plugin` — 峰谷时段与实时单价

在对话输入框下方挂一行**峰谷电价指示器**：当前是高峰还是空闲、距下次切换还有多久、节假日状态。

- **峰谷判定**：周一至周五（不含法定节假日）**9:00–12:00、14:00–18:00** 为高峰，其余为空闲。源码用 UTC 口径 `PEAK_WINDOWS = [[1,4],[6,10]]`，换算后与北京时间官方口径一致。
- **节假日日历**：内置 2026 年国务院办公厅安排作为基准，并支持在线刷新（缓存在 `~/.dsh-peak-valley.json`，7 天刷新窗口）。
- **路由**：`POST /api/dsh-peak-valley/snapshot`

> ⚠️ **已知限制**：插件内置的**单价表与当前官方定价页不符**（数值约为官方的 1/4）。但该表**只用于客户端展示**，不参与任何计费计算。峰谷与节假日判定逻辑独立且正确。详见包内 README。

### 3. `plugins/dsh-whale-pet-plugin-patched` — 鲸鱼娘桌宠（修复版）

第三方插件 [dleaf6211-hash/dsh-whale-pet](https://github.com/dleaf6211-hash/dsh-whale-pet)（MIT）的本地修改版，含 **8 项修复**：新增浏览器桌宠开关、计费口径修正（虚高 4×）、周末误判高峰、任务通知漏算缓存写、「自动拉起」永久失效、桌宠秒退、「本月消耗」陈账、以及账本自愈。

- 完整说明与实测证据：[`PATCH-NOTES.md`](plugins/dsh-whale-pet-plugin-patched/PATCH-NOTES.md)
- 来源与授权说明：[`FORK-NOTICE.md`](plugins/dsh-whale-pet-plugin-patched/FORK-NOTICE.md)

### 4. `plugins/dsh-webguard` — 端口冲突检测（**默认不装**）

`dsh web` 在端口被占用时只抛一段裸的 `EADDRINUSE` 栈。这个插件在绑定前探测端口，给出可操作提示后干净退出。

**它历史上杀死过一次 DSH**（缺陷已修复，见其 README）。收益与风险不成比例，所以 `install.mjs` **默认不安装它**：

```powershell
node install.mjs --only webguard
```

---

## 快速安装

> 前置：Node.js 18+，DSH 已能用 `dsh web` 启动。

```powershell
# 1. 克隆到任意位置
git clone <你的仓库地址> dsh-plugins
cd dsh-plugins

# 2. 安装（自动备份 + 挂载 + 校验）
node install.mjs

# 3. 重启 DSH
```

`install.mjs` 做的事情：

1. 把插件复制到 `%USERPROFILE%\.dsh\profiles\web\node_modules\`
2. 备份并更新 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`
3. 对每个文件做**语法检查**与**关键符号断言**
4. 输出清单与最终指纹

**幂等**：可反复执行。

### 其他用法

```powershell
node install.mjs --list              # 列出插件与安装状态
node install.mjs --dry-run           # 只打印计划，不动文件
node install.mjs --verify            # 只校验，不复制
node install.mjs --only whale-pet    # 只装桌宠修复版
```

### 手动安装

把 `plugins/<名字>` 复制到 `%USERPROFILE%\.dsh\profiles\web\node_modules\`（桌宠目录名改为 `dsh-whale-pet-plugin`），然后在 `cordis.patch.yml` 追加：

```yaml
- insert:
    - id: dsh-restart
      name: dsh-restart-plugin
- insert:
    - id: dsh-peak-valley
      name: dsh-peak-valley-plugin
- insert:
    - id: whale-pet
      name: dsh-whale-pet-plugin
```

---

## ⚠️ 两条必读的硬知识

这两条是踩坑踩出来的，能省你几个小时。

### 1. `patchReload: live` **不会**重载插件源码

`profiles/web/package.json` 里的 `"patchReload": "live"` 只监视 **patch 文件**（`cordis.patch.yml`）的改动，**不会**重新加载插件自己的 `.js`。

> **改了插件代码，必须重启 DSH 才生效。**
>
> 我们在排查中因此白测了好几轮：文件明明改对了，运行的一直是内存里的旧代码。

判断某个改动是否已生效，可用「可观测标记」法：加一行会写日志/改变行为的代码，重启后看日志。**不要假设热加载生效。**

### 2. 有副作用的插件**绝不能**靠 patch 热加载

`cordis.patch.yml` 一改就**立即作用于正在运行的 DSH**。

所以任何会 `process.exit()`、杀进程、占端口的插件，**绝不能用热加载方式引入**——它会在你改文件的瞬间运行，然后可能把 DSH 干掉。

> 本仓库的历史上真的发生过一次：`dsh-webguard` 被热加载后，探测到「端口已被占用」（其实是它自己），于是 `process.exit(0)`，DSH 当场死亡，`.dsh` 配置目录被删，多个会话丢失。
>
> 它已经修掉了那个缺陷，但**仍然默认不安装**。

---

## 🗂 目录结构

```
.
├── README.md                 ← 你在这里
├── INSTALL.md                ← 安装脚本说明
├── install.mjs               ← 安装 / 校验 / 更新工具
├── LICENSE                   ← MIT + 第三方组件声明
├── plugins.json              ← 生成的清单
├── plugins/
│   ├── dsh-restart-plugin/
│   ├── dsh-peak-valley-plugin/          + README-UPSTREAM.md（原说明）
│   ├── dsh-whale-pet-plugin-patched/    + PATCH-NOTES.md / FORK-NOTICE.md
│   └── dsh-webguard/
└── patches/whale-pet/        ← 桌宠两个成品文件，可直接覆盖
```

---

## 🔄 从旧结构迁移

**如果你之前从本仓库的旧版本安装过**，注意旧结构在根目录放了三个插件目录。其中：

| 旧路径 | 状态 | 处理 |
|---|---|---|
| `dsh-restart-plugin/` | 与 `plugins/` 下**内容相同**，纯重复 | **删除** |
| `dsh-peak-valley-plugin/` | 代码与 `plugins/` 下**同源**；其 README 已收进 `plugins/dsh-peak-valley-plugin/README-UPSTREAM.md` | **删除** |
| `dsh-whale-pet-plugin/` | ⚠️ **过时且未修复**（`lib/index.js` 91,702 B，只含第 1 项改动） | **务必删除**，改用 `plugins/dsh-whale-pet-plugin-patched/`（97,747 B，含全部 8 项修复） |

**为什么必须删掉根目录的桌宠**：它是本会话早期的半成品快照，只加了「浏览器桌宠开关」，**计费修复、账本自愈、自动拉起修复全都没有**。照它安装会得到一个"半修"版本，反而更难排查。

迁移后的目标结构就是上面「目录结构」那一节。删除清单：

```
dsh-restart-plugin/
dsh-peak-valley-plugin/
dsh-whale-pet-plugin/
```

---

## 🛠 维护这个仓库

**插件代码的唯一源头是 `node_modules`**，仓库里的 `plugins/` 是它的产物。

### 改了插件代码之后

```powershell
# 1. 从 node_modules 重新构建产物（会保留 .git 与手写文档）
node "D:\新建文件夹\ai_text\build-repo.mjs"

# 2. 提交并推送
cd "D:\新建文件夹\ai_text\dsh-plugins-repo"
git add -A
git commit -m "更新：<改了什么>"
git push
```

`build-repo.mjs` 的设计要点：

| 行为 | 说明 |
|---|---|
| **保留 `.git`** | 不破坏 git 工作副本，构建后可直接提交 |
| **保留「包中独有」文件** | 仓库里手写、`node_modules` 里没有的文件（如本 README、`FORK-NOTICE.md`）不会被覆盖 |
| **构建后自检** | 逐字节比对产物与 `node_modules`，不一致就报错 |
| **可复现** | `plugins.json` 不含时间戳，连续两次构建结果稳定 |

> ⚠️ **不要在仓库里直接改插件代码**——下次构建会被 `node_modules` 覆盖。
> 要改就改 `node_modules` 里的版本，然后重新构建。

### 桌宠修复的源文件位置

```
C:\Users\10766\.dsh\profiles\web\node_modules\dsh-whale-pet-plugin\
```

8 项修复的实际存放处。**重装 DSH 或 `pnpm update` 会覆盖它**——真丢了就用本仓库恢复：

```powershell
node install.mjs --only whale-pet
```

---

## 环境与版本

| 项 | 值 |
|---|---|
| DSH | `@deepseek-ai/dsh@0.1.5-rc.2` |
| Node | v24.21.0（≥18 即可） |
| Shell | Windows PowerShell 5.1（子进程内） |
| 平台 | Windows（桌宠的桌面窗口依赖 WPF，仅 Windows） |

`dsh-peak-valley-plugin` 与桌宠的**浏览器半边**跨平台可用；**桌面宠那半边仅 Windows**。

---

## 许可

- **本仓库原创部分**（restart / peak-valley / webguard / install.mjs / 文档）：MIT，见 [`LICENSE`](LICENSE)
- **鲸鱼娘桌宠**：MIT，Copyright (c) 2026 **dleaf6211-hash**，见 [`plugins/dsh-whale-pet-plugin-patched/LICENSE`](plugins/dsh-whale-pet-plugin-patched/LICENSE)
  本仓库分发的是**修改版**，修改内容与依据见 `PATCH-NOTES.md` 与 `FORK-NOTICE.md`。原版请从 [npm](https://www.npmjs.com/package/dsh-whale-pet-plugin) 或 [GitHub](https://github.com/dleaf6211-hash/dsh-whale-pet) 获取。

---

## 卸载

1. 从 `cordis.patch.yml` 删除对应的 `insert` 行
2. 删除 `node_modules` 下对应目录
3. 重启 DSH

或者从备份恢复：`cordis.patch.yml.bak-<时间戳>`。
