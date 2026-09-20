# DSH 插件集合（含桌宠修复版）

给 [DeepSeek Harness (DSH)](https://deepseek-harness.github.io/deepseek-harness/guide/quickstart) 用的插件集合，附带一份经过实测修复的**鲸鱼娘桌宠**修改版。

所有内容都来自一台真实在用的 DSH 实例，并且每处修复都有**实测证据**（A/B 对比、日志、余额对账），不是推测。

---

## 目录里有什么

| 目录 | 说明 | 来源 |
|---|---|---|
| `plugins/dsh-restart-plugin` | 一键重启 DSH：设置页加一行「重启 DSH」 | 自研 |
| `plugins/dsh-peak-valley-plugin` | 峰谷电价与节假日：DeepSeek 计费时段视图 | 自研 |
| `plugins/dsh-whale-pet-plugin-patched` | **鲸鱼娘桌宠（修复版）** | 第三方 [dleaf6211-hash/dsh-whale-pet](https://github.com/dleaf6211-hash/dsh-whale-pet)，MIT |
| `plugins/dsh-webguard` | 端口冲突检测（**默认不装**，见下） | 自研 |
| `patches/whale-pet/` | 桌宠的两个成品文件，可直接覆盖 | — |

---

## 快速安装

> 前置：Node.js 18+，DSH 已能用 `dsh web` 启动。

```powershell
# 1. 克隆到任意位置
git clone <你的仓库地址> dsh-plugins
cd dsh-plugins

# 2. 安装（会自动备份 + 挂载 + 校验）
node install.mjs

# 3. 重启 DSH
```

`install.mjs` 做的事情：

1. 把插件复制到 `%USERPROFILE%\.dsh\profiles\web\node_modules\`
2. 备份并更新 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`
3. 对每个文件做**语法检查**和**关键符号断言**
4. 输出清单与最终指纹

**幂等**：可以反复执行，已就位的不会重复处理。

### 只想装桌宠修复版

```powershell
node install.mjs --only whale-pet
```

### 手动安装（不想用脚本）

```powershell
$nm = "$env:USERPROFILE\.dsh\profiles\web\node_modules"
$cy = "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml"

# 备份
Copy-Item $cy "$cy.bak" -Force

# 复制插件
Copy-Item .\plugins\dsh-restart-plugin        "$nm\" -Recurse -Force
Copy-Item .\plugins\dsh-peak-valley-plugin    "$nm\" -Recurse -Force
Copy-Item .\plugins\dsh-whale-pet-plugin-patched "$nm\dsh-whale-pet-plugin" -Recurse -Force
```

然后在 `cordis.patch.yml` 末尾追加：

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

重启 DSH 生效。

---

## ⚠️ 两条必读的硬知识

这两条是踩坑踩出来的，能省你几个小时。

### 1. `patchReload: live` **不会**重载插件源码

`profiles/web/package.json` 里的 `"patchReload": "live"` 只监视 **patch 文件**（`cordis.patch.yml`）的改动，**不会**重新加载插件自己的 `.js`。

> **改了插件代码，必须重启 DSH 才生效。**
>
> 我们在排查中因此白测了好几轮：文件明明改对了，运行的一直是内存里的旧代码。

判断某个改动是否已生效，可用「可观测的标记」法：加一行会写日志/改变行为的代码，重启后看日志。**不要假设热加载生效。**

验证方法（不改 DSH，直接看）：

```powershell
$f = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-whale-pet-plugin\lib\index.js"
(Get-Content $f -Encoding utf8 | Select-String 'recomputeMonthlyCost').Count
```

### 2. 有副作用的插件**绝不能**靠 patch 热加载

`cordis.patch.yml` 一改就**立即作用于正在运行的 DSH**。

所以任何会 `process.exit()`、杀进程、占端口的插件，**绝不能用热加载方式引入**——它会在你改文件的瞬间运行，然后可能把 DSH 干掉。

> 本仓库的历史上真的发生过一次：一个端口检测插件被热加载后，探测到「端口已被占用」（其实是它自己），于是 `process.exit(0)`，DSH 当场死亡，`.dsh` 配置目录被删，多个会话丢失。
>
> `plugins/dsh-webguard` 已经修掉了那个缺陷（见其 README），但**仍然默认不安装**。

---

## 桌宠修复版：改了什么

上游版本 `1.0.4-new`（npm: `dsh-whale-pet-plugin`）。这里是它的修复版，共 **8 项改动**，每一项都在 README 里给了证据。

| # | 问题 | 根因 |
|---|---|---|
| 1 | 浏览器桌宠挡屏幕，无法关闭 | 没有这个设置项 |
| 2 | 消耗金额虚高约 **4 倍** | 价表硬编码了 `pro` 单价，实际用的是 `flash` |
| 3 | 周末被算成高峰时段 | 只判断小时，没判断星期 |
| 4 | 任务完成通知少算「缓存写」 | 用量快照漏了 `cacheWriteTokens` |
| 5 | **「自动拉起桌面宠」永久失效** | 只在插件加载后读一次设置；错过首次调度就再也不会拉起 |
| 6 | 桌宠启动后**瞬间退出** | 启动参数带了 `detached: true`（WPF 窗口在分离模式下秒退） |
| 7 | 「本月消耗」虚高约 **4 倍** | 历史会话的金额是旧价表算的「陈账」，写盘后不再重算 |
| 8 | 修复 7 时月度金额算成 ¥0 | 恢复顺序颠倒，对空账本求和 |

详见 [`plugins/dsh-whale-pet-plugin-patched/PATCH-NOTES.md`](plugins/dsh-whale-pet-plugin-patched/PATCH-NOTES.md)。

### 最重要的一条：账本自愈

修复 7 不是「改数据」，而是**改算法**——启动时按当前价表重算每个会话的金额：

```js
// token 数是权威，写盘金额可能是旧价表算的陈账
costCny: costOf(inp, outp, cr, cw, state.usage.lastModel)
```

这样以后改价表、换模型、插件升级，账本都会自动跟上，不会再出现「token 数对、金额错」。

---

## webguard：默认不装

它解决一个真实痛点：`dsh web` 在端口被占用时只抛一段裸的 `EADDRINUSE` 栈，没有任何「已有实例」检测。

但它**历史上杀死过一次 DSH**。缺陷已修复（用 `webServer.port !== undefined` 判断「占用者是不是自己」），不过考虑到风险与收益：

```powershell
# 想装的话，显式指定
node install.mjs --only webguard
```

**装之前请先读** [`plugins/dsh-webguard/README.md`](plugins/dsh-webguard/README.md)。

---

## 环境与版本

| 项 | 值 |
|---|---|
| DSH | `@deepseek-ai/dsh@0.1.5-rc.2` |
| Node | v24.21.0（≥18 即可） |
| Shell | Windows PowerShell 5.1（子进程内） |
| 平台 | Windows（桌宠的桌面窗口依赖 WPF，仅 Windows） |

`plugins/dsh-peak-valley-plugin` 与 `dsh-whale-pet-plugin` 的**浏览器半边**跨平台可用；**桌面宠那半边仅 Windows**。

---

## 许可

- **本仓库原创部分**（restart / peak-valley / webguard / install.mjs / 文档）：MIT，见 [`LICENSE`](LICENSE)
- **鲸鱼娘桌宠**：MIT，Copyright (c) 2026 **dleaf6211-hash**，见 [`plugins/dsh-whale-pet-plugin-patched/LICENSE`](plugins/dsh-whale-pet-plugin-patched/LICENSE)
  本仓库分发的是**修改版**，修改内容与依据见 `PATCH-NOTES.md`。原版请从 [npm](https://www.npmjs.com/package/dsh-whale-pet-plugin) 或 [GitHub](https://github.com/dleaf6211-hash/dsh-whale-pet) 获取。

---

## 卸载

1. 从 `cordis.patch.yml` 删除对应的 `insert` 行
2. 删除 `node_modules` 下对应目录
3. 重启 DSH

或者从备份恢复：`cordis.patch.yml.bak-<时间戳>`。
