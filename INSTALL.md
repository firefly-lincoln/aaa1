# 安装说明（给安装脚本用）

本目录来自 DSH 插件集合仓库。完整安装步骤见仓库根目录的 `README.md`。

## 一键安装

```powershell
cd <本目录>
node install.mjs
```

## 常用参数

```powershell
node install.mjs --list                # 列出插件与当前安装状态
node install.mjs --dry-run             # 只打印计划，不动任何文件
node install.mjs --verify              # 只校验已安装的文件，不复制
node install.mjs --only whale-pet      # 只装桌宠修复版
node install.mjs --only webguard       # 装端口检测（默认不装）
```

## 脚本做了什么

1. 把插件复制到 `%USERPROFILE%\.dsh\profiles\web\node_modules\`
2. 备份并更新 `cordis.patch.yml`（备份名带时间戳）
3. 对每个文件做**语法检查**
4. 对桌宠修复版做 **7 项关键符号断言**（确认修复真的在位）

## 两条不能忘的事

**① 装完必须重启 DSH。**

profile 里的 `"patchReload": "live"` 只监视 patch 文件，**不会重新加载插件源码**。改了插件代码不重启 = 运行的一直是旧代码。

**② 本脚本不碰 profile 的 `package.json`。**

这是刻意的：如果把桌宠写进 `dependencies`，DSH 启动时可能触发 pnpm install，**从 npm 拉取上游版本覆盖掉本地的修复版**。

## 撤销

```powershell
# 恢复 patch 文件
Copy-Item "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml.bak-<时间戳>" `
          "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml" -Force

# 删除插件
Remove-Item "$env:USERPROFILE\.dsh\profiles\web\node_modules\<插件名>" -Recurse -Force
```

然后重启 DSH。
