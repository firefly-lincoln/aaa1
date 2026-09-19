# DSH 插件合集（firefly-lincoln）

给 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 用的插件。三个都是**常驻插件**：装好之后每次启动 DSH 都会自动加载，重启不会丢。

| 插件 | 作用 | 来源 |
| --- | --- | --- |
| [`dsh-restart-plugin`](dsh-restart-plugin/) | 在「设置 → 通用」加一行 **重启 DSH**：一键重启 DSH 进程，页面自动带着新令牌回到新进程，不用关终端、不用重开浏览器 | 本项目原创 |
| [`dsh-peak-valley-plugin`](dsh-peak-valley-plugin/) | 会话标题栏 + 输入框上方显示 **DeepSeek 峰谷时段与实时单价**（含节假日日历抓取与缓存） | 本项目原创 |
| [`dsh-whale-pet-plugin`](dsh-whale-pet-plugin/) | 鲸鱼娘桌宠（浏览器悬浮 + Windows 桌面宠、余额/用量、任务通知、语音台词） | **第三方插件的修改版**，原作者 [dleaf6211-hash](https://github.com/dleaf6211-hash/dsh-whale-pet)，MIT。改动说明见 [`FORK-NOTICE.md`](dsh-whale-pet-plugin/FORK-NOTICE.md) |

## 安装

DSH 的插件装在 profile 目录里（web 界面就是 `web` profile）：

```powershell
# 方式一：让 dsh 自己装（会把包写进 profile 的依赖并加进 bundles）
dsh plugin --profile web add "D:\路径\dsh-restart-plugin"

# 方式二：手工放进 profile
#   1) 把插件目录拷到 %USERPROFILE%\.dsh\profiles\web\node_modules\<包名>
#   2) 在 %USERPROFILE%\.dsh\profiles\web\cordis.patch.yml 追加一行：
#        - insert:
#            - id: <任意行 id>
#              name: <包名>
#   3) web profile 的 patchReload 是 live，宿主半边会热加载；前端半边需要刷新一次页面
```

装完**刷新一次页面**（浏览器半边不会热加载），之后所有重启都不用再管。

## 授权

- `dsh-restart-plugin`、`dsh-peak-valley-plugin`：MIT，见根目录 [`LICENSE`](LICENSE)。
- `dsh-whale-pet-plugin`：MIT，**版权归原作者 dleaf6211-hash**，本仓库只是修改版再分发，保留原作者的 `LICENSE` 与版权声明，改动内容全部写在 `FORK-NOTICE.md` 里。
