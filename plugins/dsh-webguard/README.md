# dsh-webguard

`dsh web` 的端口冲突预检：**在 WebServer 尝试绑定之前**探测目标端口，如果发现已有服务在应答，给出可操作的信息并以干净状态退出——而不是抛出整段 `EADDRINUSE` 的 internal 栈。

---

## ⚠️ 先读这段：它**杀死过一次 DSH**

这不是夸张。这是这个插件的真实历史，写下来是为了让任何人（包括未来的我）明白风险在哪。

### 原缺陷

```js
// 原实现
const result = await probe(host, port, 1500)
if (result.isDsh) {
  console.error('端口上已经有一个 DSH 实例在运行...')
  process.exit(0)      // ← 致命
}
```

**它无法区分「另一个 DSH 实例」和「本进程自己」。**

| 时机 | 端口状态 | 探测结果 | 后果 |
|---|---|---|---|
| **启动时** | 自己还没绑定 | 探测不到 | 放行 ✅ |
| **热加载时** | 已被**自己**绑定 | 探到**自己** | 判为冲突 → `process.exit(0)` → **DSH 自杀** ❌ |

而 DSH 的 profile 默认带有 `"patchReload": "live"`——**改 `cordis.patch.yml` 会立即热加载**。所以当时的行为是：

```
19:22:07  写入 dsh-webguard\index.js
19:22:11  写入 dsh-webguard\package.json
19:22:19  改 cordis.patch.yml 加入 webguard → 触发热加载
19:22:19  输出「端口已被占用」→ process.exit(0) → DSH 进程死亡
~19:33    .dsh 配置目录被删除、会话丢失
```

### 修复

利用 `WebServer.port` 的语义：**返回 `listenedPort`，未开始监听时是 `undefined`**。

依据 `@deepseek-ai/dsh-host-webserver/lib/index.js`：

```js
get port() { return this.listenedPort }
```

于是加一行守卫，让过「已经开始监听的自己」：

```js
// 如果本进程已在提供服务,占着端口的就是自己 → 放行,绝不 exit
if (webServer.port !== undefined) return
const port = webServer.config.port
```

现在热加载时探到的「占用者」会正确识别为自己并放行。

---

## 即便如此，仍然**默认不安装**

`install.mjs` 不会自动装它。要装必须显式指定：

```powershell
node install.mjs --only webguard
```

**理由**：它的收益是「把裸异常栈换成友好提示」，而风险涉及**整个 DSH 进程的存活**。这笔账不划算——除非你确实需要它的功能。

**如果决定启用**：

1. 确认 `index.js` 第 60 行附近有 `if (webServer.port !== undefined) return`
2. 装完**正常重启** DSH（不要靠改 patch 文件热加载）
3. 观察一次启动是否正常

**出问题时的回滚**：删掉 `cordis.patch.yml` 里对应的 `insert` 行，或从 `cordis.patch.yml.bak-<时间戳>` 恢复。

---

## 它解决的问题

`dsh web` 在端口被占用时，没有任何「已有实例」检测，直接把 Node 的异常栈抛出来：

```
Error: dsh web: plugin tree failed to load: ... failed to apply loader entry webserver ...
Error: listen EADDRINUSE: address already in use 127.0.0.1:3080
    at Server.setupListenHandle (node:net:1940:16)
    ...
```

用户看不出「其实是旧实例还在跑」，也不知道该怎么办。

装上之后会得到：

```
dsh web: 端口 127.0.0.1:3080 上已经有一个 DSH 实例在运行,本次启动无法在此端口提供服务。
  · 它仍然可用:请回到之前那个浏览器标签页,或使用它启动时打印的 URL
    (认证令牌每次启动都会重新生成,所以旧 URL 无法由新进程复现)
  · 想只保留这一个实例:先停掉旧进程,再重新执行 dsh web
    查看占用者:  Get-NetTCPConnection -LocalPort 3080 -State Listen | ...
  · 想让两个实例并存:用另一个端口启动,例如  dsh web --port 3081
```

然后干净退出（不再有 internal 栈）。

---

## 判定原理

DSH 的认证围栏对未带 token 的请求返回 **401**，响应体固定为：

```
dsh web authentication required; reopen the URL printed by dsh web.
```

其他 HTTP 服务不会给出这句话。因此：

| 探测结果 | 判定 | 动作 |
|---|---|---|
| 连不上（`ECONNREFUSED` / 超时） | 端口空闲 | 放行 |
| 401 + 上述响应体 | 占用者是 DSH | 打印提示并退出 |
| 其他 HTTP 状态 | 占用者是别的程序 | 打印提示并退出 |

**为什么不能自动接管旧实例**：认证令牌（launch token）是**每进程随机生成**的（`node:crypto` 的 `randomBytes`），新进程无法复现旧实例的 URL，所以只能提示用户。

---

## 安装位置

```
%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-webguard\
%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml     ← 一条 insert
```

## 卸载

1. 从 `cordis.patch.yml` 删除对应的 `insert` 行
2. 删除 `node_modules\dsh-webguard`
3. 重启 DSH

---

## 许可

MIT（见仓库根 `LICENSE`）
