/**
 * dsh-restart-plugin — browser half.
 *
 * Adds one row to Settings → General: "重启 DSH". The row calls the host
 * plugin's routes, then waits for the replacement DSH process and navigates the
 * page back to it WITH THE NEW TOKEN — every boot mints a fresh launch token,
 * and a page left on the old one keeps rendering while its app channel fails,
 * which is what silently disables other client plugins' live features until the
 * page is reopened.
 *
 * Zero React dependency on purpose: the row is a hand-built element carrying
 * React's own element symbol with a ref callback that mounts plain DOM. That
 * pattern renders under any React instance the shell happens to ship, and it
 * keeps this bundle free of module-graph seeds. Styling is written inline
 * because a theme's brand token is not a text/background pair: this row needs a
 * guaranteed contrast, not a theme-dependent one.
 */
window.__ModuleLoader__.load({
  id: 'dsh-restart-plugin',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports

    var API = {
      status: '/api/dsh-restart/status',
      ping: '/api/dsh-restart/ping',
      restart: '/api/dsh-restart/restart',
    }
    var POLL_MS = 900
    var TIMEOUT_MS = 60000
    var STATUS_RETRY_MS = 1500
    var STATUS_RETRY_LIMIT = 24

    /** Explicit colors: readable in both light and dark themes, by construction. */
    var ACCENT = '#4d6bfe'
    var ACCENT_TEXT = '#ffffff'
    var MUTED = '#8b93a1'
    var OK = '#1a9c5b'
    var WARN = '#d98600'
    var BAD = '#d94a3d'

    function el(tag, text) {
      var node = document.createElement(tag)
      if (text !== undefined && text !== null) node.textContent = text
      return node
    }

    /** Apply inline styles, the one channel a host stylesheet cannot override. */
    function style(node, declarations) {
      for (var key in declarations) {
        if (Object.prototype.hasOwnProperty.call(declarations, key)) node.style[key] = declarations[key]
      }
      return node
    }

    function paragraph(text, extra) {
      var base = {
        marginTop: '2px',
        fontSize: '12px',
        lineHeight: '18px',
        color: MUTED,
        wordBreak: 'break-word',
      }
      for (var key in extra || {}) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) base[key] = extra[key]
      }
      return style(el('div', text), base)
    }

    /** Read one JSON route; a non-JSON answer (an auth rejection page) becomes an error. */
    function fetchJson(url, options) {
      var settings = { cache: 'no-store', credentials: 'omit' }
      for (var key in options || {}) {
        if (Object.prototype.hasOwnProperty.call(options, key)) settings[key] = options[key]
      }
      return window.fetch(url, settings).then(function (response) {
        return response.text().then(function (text) {
          var body = null
          try {
            body = JSON.parse(text)
          } catch (error) {
            throw new Error('HTTP ' + response.status + (response.ok ? '' : ' — ' + text.trim().slice(0, 80)))
          }
          if (body === null || body.ok !== true) {
            throw new Error((body && body.error) || 'HTTP ' + response.status)
          }
          return body
        })
      })
    }

    /**
     * Build the row and return its disposer.
     * @param host - the element React owns; the row is appended inside it.
     */
    function mountRow(host) {
      host.textContent = ''

      var state = {
        bootId: null,
        token: null,
        command: null,
        logPath: null,
        phase: 'connecting',
        seconds: 0,
        timer: null,
        statusTimer: null,
        statusTries: 0,
        deadline: 0,
        startedAt: 0,
        message: '',
      }

      var root = style(el('div'), {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '12px 0',
      })
      var main = style(el('div'), { flex: '1 1 auto', minWidth: '0' })
      var title = style(el('div', '重启 DSH'), { fontSize: '14px', lineHeight: '20px' })
      var desc = paragraph('关闭并重新启动 DSH 进程；页面会带着新令牌自动回到它，无需手动重开浏览器。')
      var meta = paragraph('正在连接宿主插件…', {
        fontSize: '11px',
        lineHeight: '16px',
        fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      })
      var note = style(el('div'), { marginTop: '6px', fontSize: '12px', lineHeight: '18px', color: MUTED })

      var button = style(el('button', '立即重启'), {
        flex: 'none',
        appearance: 'none',
        border: '1px solid transparent',
        borderRadius: '8px',
        padding: '6px 14px',
        fontSize: '13px',
        lineHeight: '18px',
        cursor: 'pointer',
        background: ACCENT,
        color: ACCENT_TEXT,
      })
      button.type = 'button'

      main.appendChild(title)
      main.appendChild(desc)
      main.appendChild(meta)
      main.appendChild(note)
      root.appendChild(main)
      root.appendChild(button)
      host.appendChild(root)

      function setNote(text, tone) {
        note.textContent = text || ''
        note.style.color = tone === 'ok' ? OK : tone === 'warn' ? WARN : tone === 'error' ? BAD : MUTED
      }

      function setMeta(text) {
        meta.textContent = text || ''
        meta.style.display = text ? 'block' : 'none'
      }

      function render() {
        var busy = state.phase === 'starting' || state.phase === 'restarting'
          || state.phase === 'booting' || state.phase === 'done'
        button.disabled = busy
        button.style.opacity = busy ? '0.6' : '1'
        button.style.cursor = busy ? 'default' : 'pointer'
        button.textContent = busy
          ? '正在重启…'
          : (state.phase === 'stalled' || state.phase === 'failed' ? '重试' : '立即重启')

        if (state.phase === 'connecting') setNote('正在连接宿主插件…若 DSH 刚重启，稍等片刻即可。')
        else if (state.phase === 'starting') setNote('正在请求重启…')
        else if (state.phase === 'restarting') setNote('已等待 ' + state.seconds + ' 秒；DSH 正在关闭并重新启动，请不要关闭此页面。')
        else if (state.phase === 'booting') setNote('新进程已响应，等待它完成启动…')
        else if (state.phase === 'done') setNote('✅ DSH 已重启，正在带着新令牌回到页面…', 'ok')
        else if (state.phase === 'stalled') setNote('⚠ 等了 ' + state.seconds + ' 秒仍未检测到新的 DSH 进程。可打开 ' + (state.logPath || '~/.dsh/dsh-restart.log') + ' 里最新一行 “dsh web: http://…” 的地址继续。', 'warn')
        else if (state.phase === 'failed') setNote('✗ ' + state.message, 'error')
        else setNote('')
      }

      function stop(which) {
        if (state[which] !== null) {
          window.clearInterval(state[which])
          state[which] = null
        }
      }

      function stopAll() {
        stop('timer')
        stop('statusTimer')
      }

      function succeed() {
        state.phase = 'done'
        stopAll()
        render()
        var base = window.location.origin + '/'
        var target = typeof state.token === 'string' && state.token !== ''
          ? base + '?token=' + encodeURIComponent(state.token)
          : base
        window.setTimeout(function () {
          window.location.replace(target)
        }, 400)
      }

      function poll() {
        fetchJson(API.ping)
          .then(function (info) {
            if (typeof info.token === 'string' && info.token !== '') state.token = info.token
            if (state.bootId !== null && info.bootId !== state.bootId) {
              if (info.ready === true) {
                succeed()
                return
              }
              state.phase = 'booting'
            }
          })
          .catch(function () {
            /* the old process is gone, or the new one is not listening yet */
          })
          .then(function () {
            if (state.phase === 'done') return
            state.seconds = Math.round((Date.now() - state.startedAt) / 1000)
            if (Date.now() > state.deadline) {
              state.phase = 'stalled'
              stop('timer')
            }
            render()
          })
      }

      function startPolling() {
        stop('timer')
        state.startedAt = Date.now()
        state.seconds = 0
        state.deadline = state.startedAt + TIMEOUT_MS
        state.phase = 'restarting'
        render()
        state.timer = window.setInterval(poll, POLL_MS)
      }

      /**
       * Learn this process's boot id, token, and launch command. A failure here
       * is expected while DSH is down, so it retries instead of giving up — the
       * page has no other way back.
       */
      function loadStatus() {
        fetchJson(API.status)
          .then(function (info) {
            stop('statusTimer')
            if (typeof info.bootId === 'string') state.bootId = info.bootId
            if (typeof info.token === 'string' && info.token !== '') state.token = info.token
            if (typeof info.command === 'string' && info.command !== '') state.command = info.command
            if (typeof info.logPath === 'string' && info.logPath !== '') state.logPath = info.logPath
            setMeta(state.command ? '启动命令：' + state.command : '')
            if (state.phase === 'connecting') state.phase = 'idle'
            if (info.ok !== true && info.error) {
              state.phase = 'failed'
              state.message = String(info.error)
            }
            render()
          })
          .catch(function (error) {
            state.statusTries += 1
            if (state.statusTries >= STATUS_RETRY_LIMIT) {
              stop('statusTimer')
              state.phase = 'failed'
              state.message = '宿主插件无响应（' + API.status + '）：' + String((error && error.message) || error)
            }
            render()
          })
      }

      button.addEventListener('click', function () {
        if (state.phase === 'stalled' || state.phase === 'failed') {
          state.phase = 'connecting'
          state.statusTries = 0
          state.message = ''
          render()
          loadStatus()
          state.statusTimer = window.setInterval(loadStatus, STATUS_RETRY_MS)
          startPolling()
          return
        }
        if (state.phase !== 'idle' && state.phase !== 'connecting') return
        state.phase = 'starting'
        render()
        fetchJson(API.restart, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
          .then(function (info) {
            if (typeof info.bootId === 'string') state.bootId = info.bootId
            if (typeof info.command === 'string' && info.command !== '') {
              state.command = info.command
              setMeta('启动命令：' + info.command)
            }
            startPolling()
          })
          .catch(function (error) {
            state.phase = 'failed'
            state.message = String((error && error.message) || error)
            render()
          })
      })

      loadStatus()
      state.statusTimer = window.setInterval(loadStatus, STATUS_RETRY_MS)
      render()

      return function dispose() {
        stopAll()
        if (root.parentNode) root.parentNode.removeChild(root)
      }
    }

    /** React element for the row, with a ref that mounts and disposes the DOM. */
    function makeRowElement() {
      var dispose = null
      function ref(node) {
        if (!node) {
          if (dispose !== null) {
            dispose()
            dispose = null
          }
          return
        }
        if (dispose !== null) dispose()
        dispose = mountRow(node)
      }
      return { $$typeof: Symbol.for('react.element'), type: 'div', key: null, ref: ref, props: {} }
    }

    function apply(ctx) {
      var slots = ctx && ctx.slots
      if (!slots && ctx && typeof ctx.get === 'function') {
        try {
          slots = ctx.get('slots')
        } catch (error) {
          slots = undefined
        }
      }
      if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
        if (window.console && window.console.warn) {
          window.console.warn('[dsh-restart] settings row not registered: slots service unavailable')
        }
        return
      }
      slots.inject('settings.general.item', function () {
        return slots.register(
          { name: 'settings.general.item', id: 'dsh-restart', order: 90, label: '重启 DSH' },
          function () {
            return makeRowElement()
          },
        )
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
