/**
 * Browser half — GENERATED from a dynamic Cordis package by
 * tools/build-permanent-plugin.mjs, then hosted in the permanent client-bundle
 * format. The recovered body is reproduced verbatim inside `createCore`; the
 * permanent equivalents of the sandbox's injected symbols are wired below.
 */
window.__ModuleLoader__.load({
  id: 'dsh-peak-valley-plugin',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports

    // The dynamic client runner itself resolves React this way.
    var React = require('react')

    /** A <style> element owned by this plugin, removed with it. */
    var styleElement = null
    function removeStyle() {
      if (styleElement !== null && styleElement.parentNode) styleElement.parentNode.removeChild(styleElement)
      styleElement = null
    }
    var styles = {
      insert: function (css) {
        removeStyle()
        styleElement = document.createElement('style')
        styleElement.setAttribute('data-plugin', 'dsh-peak-valley-plugin')
        styleElement.textContent = css
        document.head.appendChild(styleElement)
        return removeStyle
      },
    }

    /** Package-private RPC, now an ordinary same-origin HTTP route. */
    var host = {
      call: function (method, args) {
        return window
          .fetch('/api/dsh-peak-valley/' + encodeURIComponent(method), {
            method: 'POST',
            cache: 'no-store',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(args === undefined ? null : args),
          })
          .then(function (response) {
            return response.json().then(function (body) {
              if (!response.ok) throw new Error((body && body.error) || 'HTTP ' + response.status)
              return body
            })
          })
      },
    }

function createCore(ctx, React, host, styles) {
const PEAK_WINDOWS = [[1, 4], [6, 10]]
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const CSS = [
  '.pvp-root{display:flex;flex-direction:column;gap:2px;position:relative;width:100%;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);-webkit-font-smoothing:antialiased}',
  '.pvp-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px;cursor:pointer;user-select:none;font-variant-numeric:tabular-nums}',
  '.pvp-row:hover{color:var(--dsw-alias-label-primary)}',
  '.pvp-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-success-primary)}',
  '.pvp-dot--peak{background:var(--dsw-alias-state-warn-primary)}',
  '.pvp-live{animation:pvp-pulse 2.4s ease-in-out infinite}',
  '@keyframes pvp-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
  '.pvp-strong{color:var(--dsw-alias-label-primary);font-weight:500}',
  '.pvp-accent{color:var(--dsw-alias-state-success-primary);font-weight:500}',
  '.pvp-warn{color:var(--dsw-alias-state-warn-primary);font-weight:500}',
  '.pvp-unit{font-size:10px;opacity:.72}',
  '.pvp-sep{opacity:.35}',
  '.pvp-panel{position:absolute;bottom:calc(100% + 6px);left:0;z-index:40;min-width:264px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);box-shadow:0 6px 20px rgb(0 0 0 / 12%);font-size:11px;line-height:18px;font-variant-numeric:tabular-nums}',
  '.pvp-panel-title{color:var(--dsw-alias-label-primary);font-weight:600;margin-bottom:4px}',
  '.pvp-panel-line{display:flex;justify-content:space-between;gap:16px}',
  '.pvp-panel-note{margin-top:6px;padding-top:6px;border-top:1px solid var(--dsw-alias-border-l1);opacity:.8;font-size:10px;line-height:15px;word-break:break-all}',
  '.pvp-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}',
].join('')

function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

function utcDayKey(t) {
  const d = new Date(t)
  return d.getUTCFullYear() + '-' + MONTHS[d.getUTCMonth()] + '-' + pad(d.getUTCDate())
}

function holidayDays(holidays) {
  const days = new Set()
  if (!Array.isArray(holidays)) return days
  for (const h of holidays) {
    if (!h || typeof h.start !== 'string' || typeof h.end !== 'string') continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h.start) || !/^\d{4}-\d{2}-\d{2}$/.test(h.end)) continue
    const start = Date.parse(h.start + 'T00:00:00.000Z')
    const end = Date.parse(h.end + 'T00:00:00.000Z')
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue
    for (let t = start; t <= end && t - start <= 40 * 86400000; t += 86400000) {
      const d = new Date(t)
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue
      days.add(utcDayKey(t))
    }
  }
  return days
}

function inside(t, cal) {
  const d = new Date(t)
  const day = d.getUTCDay()
  if (day === 0 || day === 6) return false
  if (cal && cal.days && cal.days.has(utcDayKey(t))) return false
  const hour = d.getUTCHours()
  for (const w of PEAK_WINDOWS) {
    if (hour >= w[0] && hour < w[1]) return true
  }
  return false
}

function periodState(t, cal) {
  const peak = inside(t, cal)
  let nextAt = null
  for (let i = 1; i <= 8 * 24 * 60; i += 1) {
    const probe = Math.floor(t / 60000) * 60000 + i * 60000
    if (inside(probe, cal) !== peak) {
      nextAt = probe
      break
    }
  }
  return { peak: peak, tariff: peak ? 'peak' : 'off-peak', nextChangeAt: nextAt }
}

function nextHoliday(t, holidays) {
  if (!Array.isArray(holidays)) return null
  const today = utcDayKey(t)
  let best = null
  for (const h of holidays) {
    if (!h || typeof h.start !== 'string' || typeof h.end !== 'string') continue
    if (h.end < today) continue
    if (best === null || h.start < best.start) best = h
  }
  return best
}

function clockText(t) {
  const d = new Date(t)
  const week = '日一二三四五六'.charAt(d.getDay())
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const zone = 'UTC' + sign + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60)
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' 周' + week + ' ' + zone
}

function countdownText(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return null
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return days + '天' + hours + '小时'
  if (hours > 0) return hours + '小时' + minutes + '分'
  return minutes + '分'
}

function money(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  if (value >= 1) return '$' + value.toFixed(2)
  if (value >= 0.1) return '$' + value.toFixed(3)
  return '$' + value.toFixed(4)
}

function labelOf(period) {
  return period.peak ? '高峰时段' : '优惠时段'
}

function tariffOf(period, pricing) {
  if (!pricing) return null
  return period.peak ? pricing.peak : pricing.offPeak
}

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    ctx.effect(() => styles.insert(CSS))

    let snapshot = null
    const listeners = new Set()

    function publish(next) {
      snapshot = next
      for (const listener of Array.from(listeners)) {
        try {
          listener()
        } catch (error) {
          console.error('listener failed', error)
        }
      }
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }

    function useSnapshot() {
      const state = React.useState(0)
      const setVersion = state[1]
      React.useEffect(() => subscribe(() => setVersion((v) => v + 1)), [])
      return snapshot
    }

    function useNow(intervalMs) {
      const state = React.useState(() => Date.now())
      const setNow = state[1]
      React.useEffect(() => ctx.interval(() => setNow(Date.now()), intervalMs), [intervalMs])
      return state[0]
    }

    const runtime = { sessionId: null, failures: 0 }

    async function pull() {
      try {
        const result = await host.call('snapshot', { sessionId: runtime.sessionId })
        if (result && typeof result === 'object') {
          runtime.failures = 0
          publish(result)
        }
      } catch (error) {
        runtime.failures += 1
        if (runtime.failures <= 3) console.error('snapshot failed', error)
      }
    }

    let pulling = false
    function pullSafe() {
      if (pulling) return
      pulling = true
      void pull().then(
        () => {
          pulling = false
        },
        () => {
          pulling = false
        },
      )
    }

    ctx.interval(() => pullSafe(), 120000)
    ctx.timeout(() => pullSafe(), 300)

    function PeakBadge() {
      const data = useSnapshot()
      const now = useNow(1000)
      if (data === null) return null
      const cal = { days: holidayDays(data.calendar ? data.calendar.holidays : null) }
      const period = periodState(now, cal)
      const remain = countdownText(period.nextChangeAt === null ? null : period.nextChangeAt - now)
      const lead = period.peak ? '距优惠 ' : '距高峰 '
      const title = 'DeepSeek ' + labelOf(period) + '（' + (period.peak ? '标准价' : '5折') + '）' + (remain === null ? '' : ' · ' + lead + remain)
      return React.createElement(
        'div',
        { className: 'pvp-badge', title: title },
        React.createElement('span', { className: 'pvp-dot pvp-live' + (period.peak ? ' pvp-dot--peak' : '') }),
        React.createElement('span', { className: period.peak ? 'pvp-warn' : 'pvp-accent' }, labelOf(period)),
        remain === null ? null : React.createElement('span', { className: 'pvp-unit' }, lead + remain),
      )
    }

    function PriceDock() {
      const data = useSnapshot()
      const now = useNow(1000)
      const expandedState = React.useState(false)
      const expanded = expandedState[0]
      const setExpanded = expandedState[1]

      if (data === null) {
        return React.createElement(
          'div',
          { className: 'pvp-root' },
          React.createElement('div', { className: 'pvp-row' }, React.createElement('span', { className: 'pvp-unit' }, '峰谷价格 · 连接中…')),
        )
      }

      const holidays = data.calendar ? data.calendar.holidays : null
      const cal = { days: holidayDays(holidays) }
      const period = periodState(now, cal)
      const pricing = data.pricing || null
      const unit = tariffOf(period, pricing)
      const remain = countdownText(period.nextChangeAt === null ? null : period.nextChangeAt - now)
      const next = nextHoliday(now, holidays)
      const holidayHint = period.peak
        ? '距优惠 ' + (remain === null ? '-' : remain)
        : (next !== null && next.start === utcDayKey(now) ? '节假日 · 全天优惠' : '距高峰 ' + (remain === null ? '-' : remain))

      const priceText = unit === null
        ? '单价未知'
        : '命中 ' + money(unit.cacheHit) + ' · 未命中 ' + money(unit.cacheMiss) + ' · 输出 ' + money(unit.output)

      const row = React.createElement(
        'div',
        { className: 'pvp-row', onClick: () => setExpanded(!expanded) },
        React.createElement('span', { className: period.peak ? 'pvp-warn' : 'pvp-accent' }, labelOf(period) + (period.peak ? ' · 标准价' : ' · 5折')),
        React.createElement('span', { className: 'pvp-sep' }, '·'),
        React.createElement('span', { className: 'pvp-strong' }, clockText(now)),
        React.createElement('span', { className: 'pvp-sep' }, '·'),
        React.createElement('span', null, holidayHint),
        React.createElement('span', { className: 'pvp-sep' }, '·'),
        React.createElement('span', { className: 'pvp-strong' }, priceText),
        React.createElement('span', { className: 'pvp-unit' }, '/M tokens'),
      )

      if (!expanded) return React.createElement('div', { className: 'pvp-root' }, row)

      const model = pricing && pricing.model ? pricing.model : '-'
      const verified = pricing && pricing.verifiedAt ? pricing.verifiedAt : '-'
      const requested = pricing && pricing.requestedModel ? pricing.requestedModel : model
      const source = data.calendar && data.calendar.source ? data.calendar.source : 'builtin'
      const refreshed = data.calendar && data.calendar.refreshedAt ? new Date(data.calendar.refreshedAt).toLocaleString() : '未联网核实'
      const peakUnit = pricing ? pricing.peak : null
      const offUnit = pricing ? pricing.offPeak : null
      const nextText = next === null ? '-' : next.name + ' ' + next.start + ' ~ ' + next.end

      const panel = React.createElement(
        'div',
        { className: 'pvp-panel' },
        React.createElement('div', { className: 'pvp-panel-title' }, 'DeepSeek 峰谷计价'),
        React.createElement('div', { className: 'pvp-panel-line' }, React.createElement('span', null, '当前模型'), React.createElement('span', { className: 'pvp-strong' }, model + (requested && requested !== model ? '（' + requested + '）' : ''))),
        peakUnit === null ? null : React.createElement('div', { className: 'pvp-panel-line' }, React.createElement('span', null, '高峰 命中/未命中/输出'), React.createElement('span', { className: 'pvp-strong' }, money(peakUnit.cacheHit) + ' / ' + money(peakUnit.cacheMiss) + ' / ' + money(peakUnit.output))),
        offUnit === null ? null : React.createElement('div', { className: 'pvp-panel-line' }, React.createElement('span', null, '优惠 命中/未命中/输出'), React.createElement('span', { className: 'pvp-accent' }, money(offUnit.cacheHit) + ' / ' + money(offUnit.cacheMiss) + ' / ' + money(offUnit.output))),
        React.createElement('div', { className: 'pvp-panel-line' }, React.createElement('span', null, '高峰窗口(UTC)'), React.createElement('span', { className: 'pvp-strong' }, '周一至周五 01:00-04:00 / 06:00-10:00')),
        React.createElement('div', { className: 'pvp-panel-line' }, React.createElement('span', null, '下次切换'), React.createElement('span', { className: 'pvp-strong' }, (period.peak ? '转优惠 ' : '转高峰 ') + (remain === null ? '-' : remain))),
        React.createElement('div', { className: 'pvp-panel-line' }, React.createElement('span', null, '下一个节假日'), React.createElement('span', { className: 'pvp-strong' }, nextText)),
        React.createElement('div', { className: 'pvp-panel-note' }, '单价来源 ' + (pricing ? pricing.source : '-') + '（核对 ' + verified + '）；节假日表 ' + source + '，核实于 ' + refreshed + '；临近节假日前 7 天自动联网更新。'),
      )

      return React.createElement('div', { className: 'pvp-root' }, row, panel)
    }

    slots.inject('conversation.session.header.utilities', () => slots.register(
      { name: 'conversation.session.header.utilities', id: 'peak-valley-badge', order: 20, label: '峰谷时段' },
      () => React.createElement(PeakBadge, null),
    ))

    slots.inject('conversation.composer.dock', () => slots.register(
      { name: 'conversation.composer.dock', id: 'peak-valley-price', order: 30 },
      (props) => {
        if (props && typeof props.sessionId === 'string') runtime.sessionId = props.sessionId
        return React.createElement(PriceDock, null)
      },
    ))
  },
}

}

    exports.apply = function (ctx) {
      return Promise.resolve(createCore(ctx, React, host, styles)).then(function (core) {
        return core.apply(ctx)
      })
    }
    exports.inject = ['slots', 'timer']
    return module.exports
  },
})
