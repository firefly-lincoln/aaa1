# dsh-peak-valley-plugin

**巅峰**的「DeepSeek 峰谷时段与实时单价」插件 —— 原本是动态 Cordis 插件 `peak-1`（v12），
在 DSH 重启后失效；本仓库用 `tools/build-permanent-plugin.mjs` 从会话日志恢复的 v12 源码自动生成，
因此行为与用户最后批准的那一版**一致**，但**每次 DSH 启动都会自动加载，重启不再丢失**。

## 结构

| 文件 | 说明 |
| --- | --- |
| `lib/core.js` | **生成物**：恢复出来的宿主半边 body，原样包在 `createCore(ctx, harness)` 里 |
| `lib/index.js` | 手写外壳：把 `harness.handle(name, fn)` 映射成 `POST /api/dsh-peak-valley/<name>`；把沙箱 fs 换成 `node:fs` |
| `client/client.js` | **生成物**：恢复出来的浏览器半边 body，包在永久客户端 bundle 格式里；`host.call` → fetch，`styles.insert` → `<style>`，`React` → `require('react')` |

不要手改 `lib/core.js` / `client/client.js`：重新生成，保证与已审核的版本一字不差。

## 路由

`POST /api/dsh-peak-valley/snapshot`，body `{ "sessionId": "<id>" }` —— 宿主半边 `harness.handle('snapshot', …)` 的永久等价物。

## 安装 / 卸载

安装（已做）：
1. 目录拉到 `%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-peak-valley-plugin`
2. 在 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 里加一行 insert

卸载：删掉上面两处，重启 DSH。

## 重新生成

```powershell
node tools/build-permanent-plugin.mjs `
  'recovered\session\peak-1-32.host.js' `
  'recovered\session\peak-1-32.client.js' `
  'dsh-peak-valley-plugin' 'dsh-peak-valley' 'dsh-peak-valley-plugin'
```

## 验证

```powershell
node tools/smoke-permanent-client.mjs 'dsh-peak-valley-plugin\client\client.js' 'dsh-peak-valley-plugin'
node tools/verify-plugin-page.mjs dsh-peak-valley-plugin
```
