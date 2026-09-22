const NB = String.fromCharCode(10)

const CSS = [
  '.cb-root{position:fixed;right:14px;bottom:14px;z-index:60;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;font-size:12px;line-height:18px;font-family:inherit}',
  '.cb-inline{position:relative;display:inline-flex;align-items:center;pointer-events:none;font-size:12px;line-height:18px;font-family:inherit}',
  '.cb-panel{position:absolute;top:calc(100% + 8px);right:0;z-index:100}',
  '.cb-card{pointer-events:auto;box-sizing:border-box;width:270px;padding:12px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.35));background:var(--dsw-specific-menu,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,inherit);box-shadow:0 8px 28px rgba(0,0,0,.22);backdrop-filter:blur(8px)}',
  '.cb-card.cb-alert{border-color:#ef4444;box-shadow:0 8px 28px rgba(239,68,68,.28)}',
  '.cb-pill{pointer-events:auto;display:inline-flex;align-items:center;gap:7px;padding:5px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.35));background:var(--dsw-specific-menu,rgba(127,127,127,.16));color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;font:inherit;font-variant-numeric:tabular-nums;backdrop-filter:blur(8px)}',
  '.cb-pill:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.26))}',
  '.cb-dot{width:8px;height:8px;border-radius:999px;flex:none}',
  '.cb-num{font-weight:600;color:var(--dsw-alias-label-primary,inherit)}',
  '.cb-row{display:flex;justify-content:space-between;gap:10px;padding:1px 0;color:var(--dsw-alias-label-tertiary,inherit);font-variant-numeric:tabular-nums}',
  '.cb-row b{color:var(--dsw-alias-label-primary,inherit);font-weight:600}',
  '.cb-h{font-weight:600;margin-bottom:6px;color:var(--dsw-alias-label-primary,inherit)}',
  '.cb-bar{height:4px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.28));overflow:hidden;margin:8px 0 10px}',
  '.cb-bar>i{display:block;height:100%;border-radius:999px}',
  '.cb-btn{pointer-events:auto;margin-top:10px;width:100%;padding:5px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.35));background:transparent;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;font:inherit}',
  '.cb-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.26))}',
  '.cb-toast{pointer-events:auto;max-width:290px;padding:8px 11px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.35));background:var(--dsw-specific-menu,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,inherit);box-shadow:0 6px 20px rgba(0,0,0,.18)}',
  '.cb-mono{font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all}',
].join('')

function nf(n) {
  const v = Math.round(typeof n === 'number' && isFinite(n) ? n : 0)
  const s = String(Math.abs(v))
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ','
    out += s.charAt(i)
  }
  return (v < 0 ? '-' : '') + out
}
function colorOf(band) {
  if (band === 'full' || band === 'critical') return '#ef4444'
  if (band === 'high' || band === 'mid') return '#f59e0b'
  return '#22c55e'
}
function bandLabel(band) {
  if (band === 'full') return '已达上限'
  if (band === 'critical') return '紧张'
  if (band === 'high') return '偏满'
  if (band === 'mid') return '正常'
  if (band === 'low') return '从容'
  return '宽裕'
}
function hhmm(ms) {
  try {
    const d = new Date(ms)
    const p = (n) => (n < 10 ? '0' : '') + n
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
  } catch (e) { return '--:--:--' }
}

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    ctx.effect(() => styles.insert(CSS))

    // 会话头部浮标：直接向宿主索取「本会话」的现场实测值，不依赖任何全局绑定。
    // 所以每个对话显示的一定是它自己的占用，切到别的对话也各显示各的。
    function Meter(props) {
      const sid = props && props.sessionId ? String(props.sessionId) : null
      const [st, setSt] = React.useState(null)
      const [open, setOpen] = React.useState(false)

      React.useEffect(() => {
        if (!sid) return undefined
        let alive = true
        const tick = () => {
          Promise.resolve(host.call('status', { sessionId: sid })).then((v) => {
            if (!alive || !v) return
            setSt(v)
          }).catch(() => { })
        }
        tick()
        const d1 = ctx.interval(tick, 4000)
        // 注意：这里刻意不再向宿主上报绑定。浮标只读 status({sessionId})，
        // 与「宿主当前绑定哪个会话」完全无关；文档与告警一律由归属锚点决定。
        return () => {
          alive = false
          if (typeof d1 === 'function') d1()
        }
      }, [sid])

      if (!sid || !st) return null

      const pct = typeof st.percent === 'number' ? st.percent : 0
      const pctX = typeof st.pctX10 === 'number' ? st.pctX10 : pct
      const band = st.band || 'calm'
      const tint = colorOf(band)
      const next = st.nextMilestone || 0
      const need = next > 0 && st.winTokens > 0 ? Math.max(0, Math.ceil(st.winTokens * next / 100) - st.projected) : 0

      const children = []

      if (open) {
        const rows = []
        rows.push(React.createElement('div', { key: 'h', className: 'cb-h' }, '上下文用量'))
        rows.push(React.createElement('div', { key: 'bar', className: 'cb-bar' }, React.createElement('i', { style: { width: Math.max(1, pct) + '%', background: tint } })))
        rows.push(React.createElement('div', { key: 'r0', className: 'cb-row' }, React.createElement('span', null, '占用率'), React.createElement('b', null, pctX + '% · ' + bandLabel(band))))
        if (next > 0) rows.push(React.createElement('div', { key: 'r1', className: 'cb-row' }, React.createElement('span', null, '下一档 ' + next + '%'), React.createElement('b', null, '差 ' + nf(need))))
        rows.push(React.createElement('div', { key: 'r2', className: 'cb-row' }, React.createElement('span', null, 'projectedTokens'), React.createElement('b', null, nf(st.projected))))
        rows.push(React.createElement('div', { key: 'r3', className: 'cb-row' }, React.createElement('span', null, 'surfaceTokens'), React.createElement('b', null, nf(st.surface))))
        rows.push(React.createElement('div', { key: 'r4', className: 'cb-row' }, React.createElement('span', null, '窗口'), React.createElement('b', null, nf(st.winTokens))))
        rows.push(React.createElement('div', { key: 'r5', className: 'cb-row' }, React.createElement('span', null, '节点 / 轮 / 步'), React.createElement('b', null, nf(st.nodeCount) + ' / ' + nf(st.turns) + ' / ' + nf(st.steps))))
        rows.push(React.createElement('div', { key: 'r6', className: 'cb-row' }, React.createElement('span', null, '已写文档'), React.createElement('b', null, nf(st.writes) + ' 次 · ' + (st.lastWriteAt ? hhmm(st.lastWriteAt) : '—'))))
        rows.push(React.createElement('div', { key: 'r6b', className: 'cb-row' }, React.createElement('span', null, '事件 / 步前钩子'), React.createElement('b', null, nf(st.evts) + ' / ' + nf(st.preSteps))))
        rows.push(React.createElement('div', { key: 'r6d', className: 'cb-row' }, React.createElement('span', null, '轮询心跳'), React.createElement('b', null, nf(st.polls) + ' 次 · ' + (st.lastPollAt ? hhmm(st.lastPollAt) : '—'))))
        rows.push(React.createElement('div', { key: 'r6c', className: 'cb-row' }, React.createElement('span', null, '会话绑定'), React.createElement('b', null, String(st.bindSource || '—'))))
        if (st.marks && st.marks.length) {
          const t = []
          for (let i = 0; i < st.marks.length; i++) t.push(st.marks[i].pct + '%@' + hhmm(st.marks[i].at))
          rows.push(React.createElement('div', { key: 'r7', className: 'cb-row' }, React.createElement('span', null, '里程碑'), React.createElement('b', null, t.join(' '))))
        }
        if (st.docPath) rows.push(React.createElement('div', { key: 'doc', className: 'cb-mono' }, st.docPath))
        else if (st.error) rows.push(React.createElement('div', { key: 'err', className: 'cb-mono' }, String(st.error)))
        children.push(React.createElement('div', { key: 'panel', className: 'cb-card cb-panel' }, rows))
      }

      children.push(React.createElement('button', {
        key: 'pill',
        className: 'cb-pill',
        title: '上下文用量（点击展开）',
        onClick: () => setOpen(!open),
      },
        React.createElement('span', { className: 'cb-dot', style: { background: tint } }),
        React.createElement('span', null, '上下文'),
        React.createElement('span', { className: 'cb-num' }, pctX + '%'),
      ))

      // 就地渲染在会话标题栏里：每个对话各有一个，不再抢右下角那个全局位置
      return React.createElement('div', { className: 'cb-inline' }, children)
    }

    // 归属锚点：注册在 tool.view.cordis —— 该槽位只在本插件自己的运行卡片里渲染，
    // 所以它上报的会话一定是归属会话。它只用于「定锚 + 审计」，不再抢显示。
    function OwnerBinder(props) {
      const sid = props && props.sessionId ? String(props.sessionId) : null
      const pkg = props && props.packageId ? String(props.packageId) : null
      React.useEffect(() => {
        if (!sid) return undefined
        let alive = true
        const send = () => {
          if (alive) Promise.resolve(host.call('bind', { sessionId: sid, owner: true, packageId: pkg })).catch(() => { })
        }
        send()
        const dispose = ctx.interval(send, 60000)
        return () => { alive = false; if (typeof dispose === 'function') dispose() }
      }, [sid, pkg])
      return null
    }

    // 全屏浮层：只负责「跨过里程碑的提示」与「已达上限的告警卡片」，显示当前跟随的会话。
    function Alert() {
      const [st, setSt] = React.useState(null)
      const [dismissedSince, setDismissedSince] = React.useState(0)
      const [toast, setToast] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        let prevReached = -1
        const tick = () => {
          Promise.resolve(host.call('status')).then((v) => {
            if (!alive || !v) return
            if (prevReached >= 0 && typeof v.reached === 'number' && v.reached > prevReached && v.milestones) {
              const idx = Math.min(v.reached, v.milestones.length) - 1
              setToast({ text: '已跨过 ' + v.milestones[idx] + '% 里程碑 · 经验教训文档已更新', at: Date.now() })
            }
            if (typeof v.reached === 'number') prevReached = v.reached
            setSt(v)
          }).catch(() => { })
        }
        tick()
        const dispose = ctx.interval(tick, 4000)
        return () => { alive = false; if (typeof dispose === 'function') dispose() }
      }, [])

      if (!st) return null
      const pct = typeof st.percent === 'number' ? st.percent : 0
      const pctX = typeof st.pctX10 === 'number' ? st.pctX10 : pct
      const children = []

      if (toast && Date.now() - toast.at < 15000) {
        children.push(React.createElement('div', { key: 'toast', className: 'cb-toast' }, toast.text))
      }

      if (pct >= 100 && dismissedSince !== (st.fullSince || 0)) {
        const rows = []
        rows.push(React.createElement('div', { key: 'h', className: 'cb-h' }, '⛔ 上下文已满（' + pctX + '%）'))
        rows.push(React.createElement('div', { key: 'r0', className: 'cb-row' }, React.createElement('span', null, '会话'), React.createElement('b', null, String(st.short || '—'))))
        rows.push(React.createElement('div', { key: 'r1', className: 'cb-row' }, React.createElement('span', null, 'projectedTokens'), React.createElement('b', null, nf(st.projected) + ' / ' + nf(st.winTokens))))
        rows.push(React.createElement('div', { key: 'r2', className: 'cb-row' }, React.createElement('span', null, '已写入文档'), React.createElement('b', null, nf(st.writes) + ' 次')))
        if (st.reminderCount > 0) rows.push(React.createElement('div', { key: 'r3', className: 'cb-row' }, React.createElement('span', null, '已提醒对话 AI'), React.createElement('b', null, nf(st.reminderCount) + ' 次')))
        if (st.docPath) rows.push(React.createElement('div', { key: 'doc', className: 'cb-mono' }, st.docPath))
        rows.push(React.createElement('button', { key: 'b', className: 'cb-btn', onClick: () => setDismissedSince(st.fullSince || 0) }, '我知道了'))
        children.push(React.createElement('div', { key: 'alert', className: 'cb-card cb-alert' }, rows))
      }

      if (children.length === 0) return null
      return React.createElement('div', { className: 'cb-root' }, children)
    }

    // 浮标搬进「会话头部」槽位：它是会话作用域的，渲染几个对话就有几个，
    // 每个只读自己的 sessionId —— 从结构上不可能再显示成别的对话。
    slots.inject('conversation.session.header.utilities', () => slots.register(
      { name: 'conversation.session.header.utilities', id: 'ctx-budget-meter', order: 61, label: '上下文用量' },
      (props) => React.createElement(Meter, { sessionId: props ? props.sessionId : null }),
    ))

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'ctx-budget-alert', order: 50, label: '上下文告警' },
      () => React.createElement(Alert),
    ))

    slots.inject('tool.view.cordis', () => slots.register(
      { name: 'tool.view.cordis', key: 'self' },
      (props) => React.createElement(OwnerBinder, {
        sessionId: props ? props.sessionId : null,
        packageId: props ? props.packageId : null,
      }),
    ))
  },
}
