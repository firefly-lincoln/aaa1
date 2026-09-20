import { request } from 'node:http'

/**
 * dsh-webguard — dsh web 启动预检
 *
 * 背景:WebServer 的 [Service.init] 在 listen 失败时直接 reject,EADDRINUSE
 * 会让整个 boot fiber 失败并抛出裸的 Node 异常栈;而 `dsh web` 没有任何
 * 「已有实例」检测。于是「旧实例还在跑」时,用户看到的是 EADDRINUSE + 一大段
 * internal 栈,既不知道原因也不知道怎么办。
 *
 * 本插件在 WebServer 初始化之前探测目标端口:
 *   ① 端口空闲            → 放行,一切照旧;
 *   ② 端口被 DSH 占用     → 打印可操作的说明(旧实例 PID / 三条出路)后干净退出;
 *   ③ 端口被非 DSH 占用   → 打印占用者 PID 与排查提示后干净退出。
 *
 * 判据:DSH 的认证围栏会对未带 token 的请求回 401,响应体固定为
 * "dsh web authentication required; reopen the URL printed by dsh web."
 * 其他 HTTP 服务不会给出这个 body。非 HTTP 占用则连接被拒或超时 → 交由 listen 处理。
 */
export const name = 'dsh-webguard'
export const inject = ['webServer', 'connection']

function loopback(host) {
  return host === '0.0.0.0' ? '127.0.0.1' : host
}

function probe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const done = (value) => { if (!settled) { settled = true; resolve(value) } }
    const req = request({ host, port, path: '/', method: 'GET' }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { if (body.length < 2048) body += chunk })
      res.on('end', () => done({
        reachable: true,
        status: res.statusCode,
        isDsh: res.statusCode === 401 && body.includes('dsh web authentication'),
      }))
    })
    req.on('error', (error) => done({ reachable: false, code: error.code }))
    req.setTimeout(timeoutMs, () => { req.destroy(); done({ reachable: false, code: 'ETIMEDOUT' }) })
    req.end()
  })
}

export function apply(ctx) {
  ctx.effect(() => {
    let cancelled = false
    ;(async () => {
      const webServer = ctx.get('webServer')
      const connection = ctx.get('connection')
      if (webServer === undefined || connection === undefined) return
      // ⚠️ 致命缺陷修复(2026-09-20):必须让过「已经开始监听的自己」。
      // 原实现无法区分「另一个 DSH 实例」和「本进程自己」:
      //   启动时(端口未绑)→ 探测不到 → 放行;
      //   热加载时(端口已被自己绑定)→ 探到自己 → 判为冲突 → process.exit(0) → DSH 自杀。
      // WebServer.port 返回 listenedPort,未监听时是 undefined,用它判断自己是否已在提供服务。
      // 依据:@deepseek-ai/dsh-host-webserver/lib/index.js  get port() { return this.listenedPort }
      if (webServer.port !== undefined) return
      const port = webServer.config.port
      if (port === 0) return // 交给系统分配,不存在冲突

      const host = loopback(webServer.config.host)
      const result = await probe(host, port, 1500)
      if (cancelled) return
      // 只有「确实有 HTTP 服务在应答」才算冲突;连接被拒表示端口空闲
      if (!result.reachable) return

      const target = `${host}:${String(port)}`
      if (result.isDsh) {
        console.error(
          `\ndsh web: 端口 ${target} 上已经有一个 DSH 实例在运行,本次启动无法在此端口提供服务。\n` +
          `  · 它仍然可用:请回到之前那个浏览器标签页,或使用它启动时打印的 URL\n` +
          `    (认证令牌每次启动都会重新生成,所以旧 URL 无法由新进程复现)\n` +
          `  · 想只保留这一个实例:先停掉旧进程,再重新执行 dsh web\n` +
          `    查看占用者:  Get-NetTCPConnection -LocalPort ${String(port)} -State Listen |\n` +
          `                 Select-Object -ExpandProperty OwningProcess |\n` +
          `                 ForEach-Object { Get-Process -Id $_ }\n` +
          `  · 想让两个实例并存:用另一个端口启动,例如  dsh web --port 3081\n`
        )
      } else {
        console.error(
          `\ndsh web: 端口 ${target} 已被其他程序占用(HTTP ${String(result.status)}),本次启动无法绑定。\n` +
          `  · 排查占用者:  Get-NetTCPConnection -LocalPort ${String(port)} -State Listen |\n` +
          `                 Select-Object -ExpandProperty OwningProcess |\n` +
          `                 ForEach-Object { Get-Process -Id $_ }\n` +
          `  · 或改用其他端口启动:  dsh web --port 3081\n`
        )
      }
      // 干净退出:避免 WebServer 走到 listen 再抛出整段 internal 栈
      process.exit(0)
    })().catch(() => { /* 预检本身绝不阻断启动 */ })
    return () => { cancelled = true }
  }, 'dsh-webguard.preflight')
}
