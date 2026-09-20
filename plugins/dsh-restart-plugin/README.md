# dsh-restart-plugin

一键重启 DSH：在「设置 → 通用」里加一行 **重启 DSH**，点一下就把 DSH 进程重启好，不用再关终端、重开浏览器。

## 它做了什么

点按钮后：

1. 浏览器调用宿主路由 `POST /api/dsh-restart/restart`；
2. 宿主启动一个**分离的**（detached、无窗口）小助手进程，它记录了当前 DSH 的命令行与工作目录；
3. 宿主走 `ctx.appExit` 优雅退出（树先释放，再排空事件循环，最多 6 秒后强制退出）；
4. 助手等旧进程真正消失（这样 3080 端口肯定空出来），再用**完全相同的命令**把 DSH 拉起来（自动补 `--no-open`，避免多弹一个浏览器标签页）；
5. 浏览器轮询 `/api/dsh-restart/ping`，等新进程报出新的 `bootId` 且 `ready: true` 后自动刷新页面。

## 为什么需要助手进程

DSH 为它启动的每个受管子进程都建了一个 Job Object，并设置 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`——凡是走 harness 的进程通道（`subprocess` / `shell` / 终端）起来的进程，都会随 DSH 一起被终止，永远没法"起死回生"地拉起替代进程。所以本插件直接使用 Node 自己的 `child_process`：那个助手是 DSH 的普通子进程，不在任何 Job 里，能活过 DSH。

## 路由

| 路由 | 说明 |
| --- | --- |
| `GET /api/dsh-restart/status` | 进程信息 + 重启命令 + 是否可重启 |
| `GET /api/dsh-restart/ping` | `bootId` 与 `ready`，供浏览器判断"新进程起来了" |
| `POST /api/dsh-restart/restart` | 执行重启（仅 POST） |
| `POST /api/dsh-restart/selftest` | 自检：用同一个助手机制跑一个无害的替换命令，用来验证"分离进程能存活"而**不会**重启任何东西 |

## 安装位置

- 包：`%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-restart-plugin`
- 挂载：`%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 里的一条 `insert` 行
- 日志：`%USERPROFILE%\.dsh\dsh-restart.log`（重启后的新进程输出写在这里）

## 卸载

1. 把 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 里的那条 insert 改回 `[]`；
2. 删掉 `%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-restart-plugin`；
3. 重启 DSH。

## 本地测试

```powershell
node test/shim-dry-run.mjs       # 助手机制端到端（不碰 DSH）
node test/client-bundle.mjs      # 浏览器半边：注册形状 + 行挂载
node test/verify-live.mjs        # 运行中的 DSH 是否已挂载宿主路由与前端包
```

## 行为变化（须知）

重启后的 DSH 是**分离运行**的：终端回到提示符，DSH 在后台继续跑，输出进 `dsh-restart.log`。
所以之后终端里的 Ctrl+C 不再能停掉它——需要结束进程时用任务管理器结束对应的 `node.exe`。
