const NL = String.fromCharCode(10)
const BS = String.fromCharCode(92)
const TAG = 'ctx-budget'
const MILESTONES = [20, 40, 60, 80, 100]
const POLL_MS = 10000
const REFRESH_MS = 120000
const REFRESH_IDLE_MS = 60000
const REFRESH_DELTA = 1
const TOP_K = 8
const DOC_PREFIX = '上下文经验教训-'

function msg(e) { try { return String((e && e.message) || e) } catch (_) { return 'unknown error' } }
function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0 }
function nf(n) {
  const v = Math.round(num(n))
  const s = String(Math.abs(v))
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ','
    out += s.charAt(i)
  }
  return (v < 0 ? '-' : '') + out
}
function p1(x) { return String(Math.round(num(x) * 10) / 10) }
function pad2(n) { return (n < 10 ? '0' : '') + n }
function ts(ms) {
  const d = new Date(num(ms))
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
}
function dur(ms) {
  const m = Math.round(num(ms) / 60000)
  if (m < 1) return '不足 1 分钟'
  if (m < 60) return m + ' 分钟'
  return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分钟'
}
function uuid() {
  const h = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 32; i++) s += h.charAt(Math.floor(Math.random() * 16))
  return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20)
}
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    const keys = Object.keys(o)
    for (let i = 0; i < keys.length; i++) deepFreeze(o[keys[i]])
  }
  return o
}
function bandOf(p) {
  if (p >= 100) return 'full'
  if (p >= 80) return 'critical'
  if (p >= 60) return 'high'
  if (p >= 40) return 'mid'
  if (p >= 20) return 'low'
  return 'calm'
}
function bandText(p) {
  if (p >= 100) return '已达窗口上限'
  if (p >= 80) return '紧张'
  if (p >= 60) return '偏满'
  if (p >= 40) return '正常'
  if (p >= 20) return '从容'
  return '宽裕'
}

const S = {
  phase: 'starting',
  error: null,
  caps: '',
  sessionId: null,
  cwd: null,
  docPath: null,
  winTokens: 0,
  surface: 0,
  pressure: 0,
  projected: 0,
  sampled: 0,
  percent: 0,
  metricSource: 'none',
  nodeCount: 0,
  sysTokens: 0,
  histTokens: 0,
  top: [],
  turns: 0,
  steps: 0,
  openStep: false,
  reached: 0,
  marks: [],
  writes: 0,
  lastWriteAt: 0,
  lastWritePercent: -1,
  writeReason: '',
  fullSince: 0,
  polls: 0,
  evts: 0,
  preSteps: 0,
  lastPollAt: 0,
  lastEventAt: 0,
  pctX10: 0,
  bindSource: 'none',
  ownerLocked: false,
  ownerVerified: false,
  ownerSessionId: null,
  lastSwitchAt: 0,
  baselined: false,
  switchNote: '',
  lastError: null,
  reminder: { armed: false, count: 0, at: 0, nextAt: 0, error: null },
  startedAt: 0,
}

function nextMilestone() {
  if (S.reached >= MILESTONES.length) return 0
  return MILESTONES[S.reached]
}

function findSession(sessions, id) {
  if (!sessions || !id) return null
  try { return sessions.get(id) || null } catch (e) { S.lastError = 'sessions.get: ' + msg(e); return null }
}

function readMetrics(sess, projections, meter) {
  let win = 0
  try {
    const rc = sess.requestContext()
    if (rc && typeof rc.contextWindow === 'number') win = rc.contextWindow
  } catch (e) { S.lastError = 'requestContext: ' + msg(e) }

  // surface/pressure 以 measure() 为准：实测投影视图里 surfaceTokens 可能为 0。
  let surface = 0
  let pressure = 0
  let sampled = 0
  if (meter) {
    try {
      const m = meter.measure(sess)
      surface = num(m.surfaceTokens)
      pressure = num(m.totalTokens)
      sampled = surface
    } catch (e) { S.lastError = 'measure: ' + msg(e) }
  }

  if (projections) {
    try {
      const snap = projections.snapshot(sess, ['contextPressure'])
      const v = snap && snap.values ? snap.values.contextPressure : null
      if (v && typeof v.contextWindow === 'number') {
        win = v.contextWindow
        if (num(v.surfaceTokens) > 0) surface = num(v.surfaceTokens)
        if (num(v.pressureTokens) > 0) pressure = num(v.pressureTokens)
        sampled = num(v.sampledSurfaceTokens)
        let projected = num(v.projectedTokens)
        if (!(projected > 0)) projected = pressure > 0 ? Math.max(0, pressure + surface - sampled) : surface
        if (!(projected > 0)) projected = surface
        return { source: 'projection', win: win, surface: surface, pressure: pressure, sampled: sampled, projected: projected }
      }
    } catch (e) { S.lastError = 'projection: ' + msg(e) }
  }

  const projected = pressure > 0 ? pressure : surface
  return { source: pressure > 0 ? 'measure' : 'none', win: win, surface: surface, pressure: pressure, sampled: sampled, projected: projected }
}

function collectBreakdown(sess, meter) {
  const out = { nodeCount: 0, total: 0, sys: 0, hist: 0, top: [] }
  if (!meter) return out
  let m = null
  try { m = meter.measure(sess) } catch (e) { S.lastError = 'measure2: ' + msg(e); return out }
  const nodes = (m && m.nodes) || []
  out.nodeCount = nodes.length
  const k = []
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i]
    let t = num(nd.tokens)
    if (!(t > 0)) t = num(nd.heuristicTokens)
    out.total += t
    let isSys = false
    try {
      const ev = sess.eventAt(nd.seq)
      isSys = !!(ev && ev.type === 'system/message')
    } catch (e) { /* classification is best effort */ }
    if (isSys) out.sys += t; else out.hist += t
    const item = { seq: num(nd.seq), tokens: t, system: isSys }
    if (k.length < TOP_K) { k.push(item); continue }
    let mi = 0
    for (let j = 1; j < k.length; j++) { if (k[j].tokens < k[mi].tokens) mi = j }
    if (item.tokens > k[mi].tokens) k[mi] = item
  }
  k.sort(function (a, b) { return b.tokens - a.tokens })
  out.top = k
  return out
}

// 审计用：确认候选会话的日志里真的有一条创建本 Package 的 cordis_* 调用。
function verifyOwner(s, packageId) {
  if (!packageId) return false
  try {
    const end = num(s.seq)
    const from = Math.max(0, end - 600)
    for (let i = end - 1; i >= from; i--) {
      const ev = s.eventAt(i)
      if (!ev || ev.type !== 'tool/call') continue
      const nm = ev.data && ev.data.name ? String(ev.data.name) : ''
      if (nm !== 'cordis_run' && nm !== 'cordis_define') continue
      const a = ev.data && ev.data.arguments ? String(ev.data.arguments) : ''
      if (a.indexOf(packageId) >= 0) return true
    }
  } catch (e) { /* audit only */ }
  return false
}

function seedCounts(sess) {
  try {
    const end = num(sess.seq)
    if (end <= 0) return
    const from = Math.max(0, end - 400)
    for (let i = from; i < end; i++) {
      const ev = sess.eventAt(i)
      if (!ev) continue
      if (ev.type === 'turn/start') { S.turns = num(ev.data && ev.data.turn); S.openStep = true }
      else if (ev.type === 'turn/end') { S.openStep = false }
      else if (ev.type === 'step/start') { S.steps = num(ev.data && ev.data.step); if (ev.data && ev.data.turn) S.turns = num(ev.data.turn); S.openStep = true }
      else if (ev.type === 'step/end') { /* keep open flag as reported by turn events */ }
    }
  } catch (e) { S.lastError = 'seedCounts: ' + msg(e) }
}

function reminderText() {
  const L = []
  L.push('[上下文预算 · 自动告警]')
  L.push('本会话上下文占用已达 ' + S.percent + '%（' + nf(S.projected) + ' / ' + nf(S.winTokens) + ' tokens）。')
  L.push('这是 DSH 进程内实测值（与界面上下文仪表同源），不是模型的估计。')
  L.push('建议按顺序处理：')
  L.push('1) 停止把大文件整段读入上下文，改用 grep / read 的 offset+limit 分段取用；')
  L.push('2) 把已确认的结论先写进工作区文档，避免丢失；')
  L.push('3) 主动提示用户执行「压缩上下文」或另起一个新会话继续，把本文档作为交接材料。')
  if (S.docPath) L.push('经验教训文档：' + S.docPath)
  return L.join(NL)
}

function buildDoc() {
  const L = []
  const now = Date.now()
  const win = S.winTokens
  const next = nextMilestone()
  const tot = S.sysTokens + S.histTokens
  const up = now - S.startedAt

  L.push('# 上下文用量 · 经验教训（自动记录）')
  L.push('')
  L.push('> **本文件由 DSH 动态插件 `' + TAG + '` 自动维护，请勿手工编辑** —— 每次刷新都会整份覆盖。')
  L.push('>')
  L.push('> 数据来源：DSH **进程内**的 `contextPressure` 投影，与界面上的「上下文仪表」同一份数据。')
  L.push('> 全程只读内存：**不读磁盘、不调用模型、不消耗任何 token**，内存占用只有几百字节的标量状态。')
  L.push('>')
  L.push('> ⚠️ 上下文占用**只在有新内容写入时才增长**（用户消息、模型回复、工具结果）。')
  L.push('> 只是停在对话里不动，百分比本来就不会变 —— 要确认插件还活着，请看下面的「轮询心跳」行。')
  L.push('')
  L.push('- 会话：`' + String(S.sessionId) + '`')
  L.push('- 工作区：`' + String(S.cwd) + '`')
  L.push('- 上下文窗口：' + nf(win) + ' tokens')
  L.push('- 里程碑刻度：20% / 40% / 60% / 80% / 100%（每跨过一档自动重写；期间也会周期刷新）')
  L.push('- 本文件最后更新：' + ts(now) + '（触发原因：' + S.writeReason + '）')
  L.push('- 插件已运行：' + dur(up) + '，轮询 ' + S.polls + ' 次，写盘 ' + S.writes + ' 次')
  L.push('- 轮询心跳：第 ' + S.polls + ' 次于 ' + ts(S.lastPollAt) + '（每 ' + Math.round(POLL_MS / 1000) + ' 秒一次，这一行会持续前进）')
  L.push('- 事件监听自检：收到 `session/event` ' + S.evts + ' 次，`agent/pre-step` ' + S.preSteps + ' 次（为 0 说明事件未送达本插件）')
  L.push('- 会话绑定方式：`' + S.bindSource + '`' + (S.bindSource === 'owner' ? '（owner = 由插件自己的运行卡片上报，最可靠）' : (S.bindSource === 'client' ? '（client = 会话头部槽位上报的候选值）' : '')))
  if (S.switchNote) L.push('- 绑定变更记录：' + S.switchNote)
  if (S.lastError) L.push('- ⚠️ 最近一次内部错误：`' + String(S.lastError) + '`')
  L.push('')
  L.push('---')
  L.push('')
  L.push('## 一、当前状态')
  L.push('')
  L.push('| 指标 | 数值 | 说明 |')
  L.push('| --- | --- | --- |')
  L.push('| **占用率** | **' + S.percent + '%**（' + bandText(S.percent) + '） | projectedTokens ÷ 窗口，与界面仪表口径一致 |')
  if (next > 0) {
    const need = Math.max(0, Math.ceil(win * next / 100) - S.projected)
    L.push('| 下一里程碑 | ' + next + '% | 还差约 ' + nf(need) + ' tokens（' + p1(next - (win > 0 ? S.projected / win * 100 : 0)) + ' 个百分点） |')
  } else {
    L.push('| 下一里程碑 | 无（五档已全部跨过） | 已到达 100% 档 |')
  }
  L.push('| 已装载 surfaceTokens | ' + nf(S.surface) + ' | 当前真正装进上下文的节点合计 |')
  L.push('| 提示词压力 pressureTokens | ' + nf(S.pressure) + ' | 最近一次请求的提示词侧总量 |')
  L.push('| 预计下次请求 projectedTokens | ' + nf(S.projected) + ' | 决定界面百分比的那个数 |')
  L.push('| 上下文节点数 | ' + nf(S.nodeCount) + ' | 一条消息或一段工具结果 = 1 个节点 |')
  if (tot > 0) {
    L.push('| 其中·系统提示 | ' + nf(S.sysTokens) + '（' + p1(S.sysTokens / tot * 100) + '%） | 系统提示词本身 |')
    L.push('| 其中·对话历史 | ' + nf(S.histTokens) + '（' + p1(S.histTokens / tot * 100) + '%） | 用户消息 + 模型回复 + 工具结果 |')
  }
  L.push('| 轮次 / 步骤 | ' + nf(S.turns) + ' / ' + nf(S.steps) + ' | 本会话当前进度 |')
  L.push('| 指标来源 | `' + S.metricSource + '` | projection = 与界面同源；measure = 回退口径 |')
  L.push('')

  L.push('## 二、里程碑时间线')
  L.push('')
  if (S.marks.length === 0) {
    L.push('_尚未跨过任何 20% 刻度。本文件会在第一次跨档时补上第一行。_')
  } else {
    L.push('| 里程碑 | 达成时间 | 占用率 | projectedTokens | 节点数 | 距上一档 | 用时 |')
    L.push('| --- | --- | --- | --- | --- | --- | --- |')
    for (let i = 0; i < S.marks.length; i++) {
      const a = S.marks[i]
      const prev = i > 0 ? S.marks[i - 1] : null
      const dt = prev ? nf(a.projected - prev.projected) : '—'
      const du = prev ? dur(a.at - prev.at) : '—'
      const label = a.baseline ? '启动基线' : '**' + a.pct + '%**'
      L.push('| ' + label + ' | ' + ts(a.at) + ' | ' + a.percent + '% | ' + nf(a.projected) + ' | ' + nf(a.nodes) + ' | ' + dt + ' | ' + du + ' |')
    }
  }
  L.push('')

  L.push('## 三、经验教训（由实测数据自动推导）')
  L.push('')
  const lessons = []
  const marks = S.marks

  if (marks.length >= 2) {
    const a = marks[marks.length - 2]
    const b = marks[marks.length - 1]
    const dTok = b.projected - a.projected
    const dMs = Math.max(1, b.at - a.at)
    const perMin = dTok / (dMs / 60000)
    const remain = Math.max(0, win - S.projected)
    const etaMin = perMin > 0 ? remain / perMin : 0
    lessons.push('**增速**：' + a.pct + '% → ' + b.pct + '% 净增 ' + nf(dTok) + ' tokens，用时 ' + dur(dMs) + '，约 **' + nf(perMin) + ' tokens/分钟**（' + nf(perMin * 60) + '/小时）。剩余 ' + nf(remain) + ' tokens，按此速率约还能撑 **' + (perMin > 0 ? dur(etaMin * 60000) : '∞（增速为 0）') + '**。')
  } else {
    lessons.push('**增速**：目前只有 ' + marks.length + ' 个里程碑记录，样本不足。跨过 40% 之后，本项会自动给出「tokens/分钟」和「还能撑多久」。')
  }

  if (tot > 0) {
    const hp = S.histTokens / tot * 100
    if (hp >= 95) lessons.push('**占用来源**：对话历史占 ' + p1(hp) + '%，系统提示只占 ' + p1(100 - hp) + '%。占用是**聊出来的**，不是提示词臃肿 —— 想降占用只能压缩历史（大段工具结果、长回复），改提示词没用。')
    else if (hp <= 60) lessons.push('**占用来源**：系统提示占 ' + p1(100 - hp) + '%，显著偏高。提示词本身很可能是主要成本，值得先查它。')
    else lessons.push('**占用来源**：对话历史 ' + p1(hp) + '% / 系统提示 ' + p1(100 - hp) + '%，属常见分布。')
  }

  if (S.top.length > 0 && tot > 0) {
    let sum = 0
    for (let i = 0; i < S.top.length; i++) sum += S.top[i].tokens
    const share = sum / tot * 100
    lessons.push('**集中度**：最大的 ' + S.top.length + ' 个节点合计 ' + nf(sum) + ' tokens，占已装载的 **' + p1(share) + '%**（≈ ' + p1(sum / (win || 1) * 100) + ' 个百分点）。' + (share >= 40 ? '占用**高度集中**：优先压缩这几块，收益最大。' : '占用**分散**在 ' + nf(S.nodeCount) + ' 个节点上，属长期累积型，单点压缩收益有限 —— 更有效的是归档结论后换新会话。'))
    const t0 = S.top[0]
    const s0 = t0.tokens / tot * 100
    lessons.push('**最大单节点**：`seq=' + nf(t0.seq) + '`，' + nf(t0.tokens) + ' tokens，占 ' + p1(s0) + '%' + (t0.system ? '（系统提示）' : '') + '。' + (s0 > 3 ? '单条就吃掉 ' + p1(s0) + '%，属异常臃肿，值得单独回看。' : '没有异常臃肿的单条消息，符合「轮次累积」特征。'))
  }

  if (marks.length >= 3) {
    const n1 = marks.length - 1
    const r1 = (marks[n1].projected - marks[n1 - 1].projected) / Math.max(1, marks[n1].at - marks[n1 - 1].at)
    const r2 = (marks[n1 - 1].projected - marks[n1 - 2].projected) / Math.max(1, marks[n1 - 1].at - marks[n1 - 2].at)
    if (r1 > r2 * 1.25) lessons.push('**趋势**：最近一档的增速比上一档快 ' + p1((r1 / (r2 || 1) - 1) * 100) + '%，上下文在**加速膨胀** —— 通常意味着最近几步引入了大块工具结果。')
    else if (r2 > r1 * 1.25) lessons.push('**趋势**：最近一档的增速比上一档慢 ' + p1((1 - r1 / (r2 || 1)) * 100) + '%，膨胀在放缓。')
    else lessons.push('**趋势**：相邻两档增速接近，上下文在**匀速**累积，可按当前节奏外推。')
  }

  for (let i = 0; i < lessons.length; i++) L.push((i + 1) + '. ' + lessons[i])
  L.push('')

  L.push('## 四、行动建议（按当前档位）')
  L.push('')
  const p = S.percent
  if (p >= 100) {
    L.push('- ⛔ **已到达窗口上限**：下一步请求有失败或被自动压缩的风险。')
    L.push('- 立刻停止新增上下文：不要再整段读文件、不要跑大输出命令。')
    L.push('- 把结论落盘（工作区文档），然后**压缩上下文或另起新会话**，用文档交接。')
  } else if (p >= 80) {
    L.push('- ⚠️ **进入紧张区**：建议现在就开始收尾，不要开新的大任务块。')
    L.push('- 大文件用 `grep` 定位 + `read` 的 `offset/limit` 分段取，别整体读入。')
    L.push('- 阶段性结论及时写进工作区文档，为压缩/换会话做准备。')
  } else if (p >= 60) {
    L.push('- 偏满但可控：避免把大段输出留在上下文里，能落盘就落盘。')
    L.push('- 留意工具结果体积；一次性 dump 大 JSON / 大目录列表是最常见的膨胀源。')
  } else if (p >= 40) {
    L.push('- 正常区间：按当前方式继续即可。')
    L.push('- 可以顺手把「已完成/待办」写进文档，减少后面靠上下文回忆的依赖。')
  } else {
    L.push('- 宽裕：无需任何干预。')
  }
  L.push('')

  L.push('## 五、给本对话 AI 的自检清单')
  L.push('')
  L.push('- **模型感知不到自己的上下文占用**：本文件里的数字是 DSH 进程内实测，可信；任何「我大概用了 N 万 token」的说法都是猜测。')
  L.push('- 每次准备「整体读入一个大文件」之前，先想一次：这会不会一次吃掉几个百分点？')
  L.push('- 大量同类信息优先落盘成文档，再在上下文里只保留结论与路径。')
  L.push('- 超过 80% 后，主动向用户提议压缩或另起会话，并把本文件当作交接材料。')
  L.push('- 本文件由插件自动覆盖写入，**不要把它当作需要维护的产物去手工编辑**。')
  L.push('')

  L.push('---')
  L.push('')
  L.push('_生成插件：DSH 动态 Cordis 插件 `' + TAG + '`（宿主半 + 客户端浮层）。卸载插件后本文件不再更新，但会保留最后一份内容。_')
  L.push('')
  return L.join(NL)
}

return {
  inject: ['timer'],
  async apply(ctx) {
    try {
      S.startedAt = Date.now()
      const agents = ctx.get('agents')
      const sessions = ctx.get('sessions')
      const meter = ctx.get('tokenMeter')
      const projections = ctx.get('sessionProjections')
      const fs = ctx.get('fs')
      S.caps = 'agents=' + !!agents + ' sessions=' + !!sessions + ' meter=' + !!meter + ' projections=' + !!projections + ' fs=' + !!fs

      let sess = null

      // 会话状态按会话 id 分开保存：跟着界面切换会话时，各自的里程碑不会互相覆盖。
      const perSession = {}

      // 绑定「当前正在看的那个会话」。
      // view      = 会话头部槽位上报的可见会话：跟着界面走，这是主路径。
      // owner     = tool.view.cordis 槽位上报：该槽位只在本插件自己的运行卡片里渲染，
      //             所以它的 sessionId 一定是归属会话，用作锚点与审计，并跳过防抖。
      // initiator = 免批准激活路径下 currentInitiator 的返回值。
      const setBound = (s, source) => {
        if (!s) return false
        const id = String(s.id)
        if (S.sessionId === id) { S.bindSource = source; S.phase = 'active'; return true }
        if (S.sessionId) {
          perSession[S.sessionId] = { reached: S.reached, marks: S.marks, baselined: S.baselined, docPath: S.docPath }
        }
        const saved = perSession[id]
        S.sessionId = id
        try { S.cwd = s.header && s.header.cwd ? String(s.header.cwd) : null } catch (e) { S.cwd = null }
        S.bindSource = source
        S.phase = 'active'
        S.reached = saved ? saved.reached : 0
        S.marks = saved ? saved.marks : []
        S.baselined = saved ? saved.baselined : false
        S.docPath = saved ? saved.docPath : null
        S.lastWriteAt = 0
        S.lastWritePercent = -1
        S.fullSince = 0
        S.lastEventAt = 0
        S.lastSwitchAt = Date.now()
        sess = s
        seedCounts(s)
        return true
      }
      const bindView = (id, source) => {
        if (!id) return false
        const s = findSession(sessions, String(id))
        if (!s) return false
        let cwd = null
        try { cwd = s.header && s.header.cwd ? String(s.header.cwd) : null } catch (e) { cwd = null }
        if (!cwd) return false
        // 只跟随同一工作区的会话，避免子代理或别的项目把显示抢走
        if (S.cwd && cwd !== S.cwd) { S.switchNote = '忽略跨工作区会话 ' + String(id).slice(8, 16); return false }
        // 防抖：30 秒内只允许改绑一次，避免多个已挂载的会话视图互相抢
        if (S.sessionId && S.sessionId !== String(id) && Date.now() - S.lastSwitchAt < 30000) return false
        return setBound(s, source)
      }
      const bindOwner = (id, packageId) => {
        if (!id) return false
        const s = findSession(sessions, String(id))
        if (!s) return false
        S.ownerLocked = true
        if (S.ownerSessionId === null) S.ownerSessionId = String(id)
        // 关键：归属上报必须「可核实」—— 该会话的日志里真的要有创建本 Package 的 cordis_* 调用。
        // 实测：用户没在看的对话，其运行卡片/头部槽位照样会上报，光看「谁报了」根本分不清；
        // 但「这个 packageId 是不是在这个会话里被 cordis_run 过」是确定的、不依赖时序的。
        const verified = verifyOwner(s, packageId)
        S.ownerVerified = verified
        if (!verified) {
          S.switchNote = '拒绝未核实的归属上报 ' + String(id).slice(8, 16)
          return false
        }
        return setBound(s, 'owner')
      }
      const adopt = () => {
        if (!agents || !sessions) return null
        let me = null
        try { me = agents.currentInitiator() || null } catch (e) { S.lastError = 'currentInitiator: ' + msg(e) }
        if (!me) return null
        return bindView(String(me.id), 'initiator') ? sess : null
      }
      sess = adopt()
      if (!sess) S.phase = 'waiting-bind'

      // 会话事件：只维护轻量计数器，不做任何重活
      ctx.on('session/event', function (session, event) {
        S.evts = S.evts + 1
        try {
          if (!session || String(session.id) !== S.sessionId || !event) return
          S.lastEventAt = Date.now()
          if (event.type === 'turn/start') { S.turns = num(event.data && event.data.turn); S.openStep = true }
          else if (event.type === 'turn/end') { S.openStep = false }
          else if (event.type === 'step/start') { S.steps = num(event.data && event.data.step); if (event.data && event.data.turn) S.turns = num(event.data.turn); S.openStep = true }
        } catch (e) { /* counters are best effort */ }
      })

      // 把「上下文已满」直接送进该会话模型下一步的输入里
      ctx.on('agent/pre-step', async function (payload, next) {
        S.preSteps = S.preSteps + 1
        let decision = null
        try { decision = await next() } catch (e) { throw e }
        try {
          if (!S.reminder.armed) return decision
          if (!payload || !payload.agent || String(payload.agent.id) !== S.sessionId) return decision
          if (!decision || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision
          const note = deepFreeze({
            id: uuid(),
            role: 'user',
            content: [{ type: 'text', text: reminderText() }],
            source: { kind: 'plugin', plugin: TAG, form: 'notice', summary: '上下文 ' + S.percent + '% 告警' },
          })
          S.reminder.armed = false
          S.reminder.count = S.reminder.count + 1
          S.reminder.at = Date.now()
          S.reminder.nextAt = Date.now() + 30 * 60000
          return { kind: 'enter', messages: decision.messages.concat([note]) }
        } catch (e) {
          S.reminder.error = msg(e)
          return decision
        }
      })

      const writeDoc = async (reason) => {
        S.writeReason = reason
        if (!fs || !S.cwd) { S.lastError = 'writeDoc: no fs or cwd'; return false }
        let base = String(S.cwd)
        while (base.length > 3 && (base.charAt(base.length - 1) === BS || base.charAt(base.length - 1) === '/')) base = base.slice(0, -1)
        const short = S.sessionId ? String(S.sessionId).slice(8, 16) : 'unknown'
        const path = base + BS + DOC_PREFIX + short + '.md'
        try {
          const target = await fs.resolve(path, { cwd: String(S.cwd) })
          const policy = { mode: 'workspace-write', workspaceRoot: String(S.cwd) }
          S.docPath = path
          S.writes = S.writes + 1
          S.lastWriteAt = Date.now()
          S.lastWritePercent = S.percent
          await fs.writeText(target, buildDoc(), undefined, undefined, policy)
          return true
        } catch (e) {
          S.lastError = 'writeDoc: ' + msg(e)
          S.docPath = path
          return false
        }
      }

      const noteMilestones = () => {
        if (S.winTokens <= 0) return false
        let m = Math.floor(S.percent / 20)
        if (m > 5) m = 5
        const armFull = () => {
          if (S.percent >= 100 && !S.fullSince) S.fullSince = Date.now()
          if (S.percent >= 100 && !S.reminder.armed && S.reminder.count < 6 && Date.now() >= S.reminder.nextAt) {
            S.reminder.armed = true
          }
        }
        const refreshBreakdown = () => {
          const details = collectBreakdown(sess, meter)
          if (details.nodeCount > 0) {
            S.nodeCount = details.nodeCount
            S.sysTokens = details.sys
            S.histTokens = details.hist
            S.top = details.top
          }
        }
        // 首次观测：插件可能是在已经用了很久的会话里才被激活的。
        // 这时不能补造 20%/40% 的假时间线，只记一条「启动基线」，reached 直接对齐当前档位。
        if (!S.baselined) {
          S.baselined = true
          refreshBreakdown()
          S.reached = m
          S.marks.push({
            pct: m * 20,
            at: Date.now(),
            baseline: true,
            percent: S.percent,
            projected: S.projected,
            surface: S.surface,
            nodes: S.nodeCount,
            sys: S.sysTokens,
            hist: S.histTokens,
            top: S.top.slice(0),
          })
          armFull()
          return true
        }
        if (m <= S.reached) return false
        refreshBreakdown()
        const added = []
        while (S.reached < m) {
          S.reached = S.reached + 1
          const pct = MILESTONES[S.reached - 1]
          S.marks.push({
            pct: pct,
            at: Date.now(),
            percent: S.percent,
            projected: S.projected,
            surface: S.surface,
            nodes: S.nodeCount,
            sys: S.sysTokens,
            hist: S.histTokens,
            top: S.top.slice(0),
          })
          added.push(pct)
        }
        armFull()
        return added.length > 0
      }

      const poll = async () => {
        try {
          S.polls = S.polls + 1
          if (!sess) sess = adopt()
          if (!sess && S.sessionId) sess = findSession(sessions, S.sessionId)
          if (!sess) { S.phase = 'waiting-bind'; return }
          let live = null
          try { live = sessions.get(sess.id) } catch (e) { live = null }
          if (!live) { S.phase = 'session-gone'; sess = null; return }
          sess = live

          const mt = readMetrics(sess, projections, meter)
          if (!mt) { S.phase = 'no-metrics'; return }
          S.winTokens = num(mt.win)
          S.surface = num(mt.surface)
          S.pressure = num(mt.pressure)
          S.sampled = num(mt.sampled)
          S.projected = num(mt.projected)
          S.metricSource = mt.source
          S.lastPollAt = Date.now()
          if (S.winTokens > 0) {
            const rawPct = S.projected / S.winTokens * 100
            S.pctX10 = Math.round(rawPct * 10) / 10
            S.percent = Math.min(100, Math.round(rawPct))
          } else {
            S.pctX10 = 0
            S.percent = 0
          }

          const crossed = noteMilestones()
          const now = Date.now()
          const stale = now - S.lastWriteAt >= REFRESH_IDLE_MS
          const moved = Math.abs(S.percent - S.lastWritePercent) >= REFRESH_DELTA && now - S.lastWriteAt >= REFRESH_MS
          if (!S.docPath || crossed || stale || moved) {
            await writeDoc(crossed ? '跨过 ' + MILESTONES[S.reached - 1] + '% 里程碑（当前 ' + S.percent + '%）' : (S.docPath ? '周期刷新（当前 ' + S.percent + '%）' : '启动建立'))
          }
        } catch (e) {
          S.lastError = 'poll: ' + msg(e)
        }
      }

      // 首轮立刻跑一次（建立文档 + 拿到基线），之后按间隔轮询
      ctx.timeout(function () { poll() }, 800)
      ctx.interval(function () { poll() }, POLL_MS)

      // 客户端上报所属会话：这是唯一在「需要用户批准」的激活路径下也成立的绑定方式
      harness.handle('bind', function (args) {
        try {
          const id = args && typeof args.sessionId === 'string' ? args.sessionId : null
          if (!id) return { ok: false, reason: 'no-session-id' }
          const pkg = args && typeof args.packageId === 'string' ? args.packageId : null
          const isOwner = !!(args && args.owner === true)
          let ok = false
          if (isOwner) {
            ok = bindOwner(id, pkg)
          } else {
            // 非归属上报一律忽略：实测多个已挂载会话都会上报，接受它只会让绑定来回跳。
            S.switchNote = '忽略非归属上报 ' + String(id).slice(8, 16)
            ok = false
          }
          if (ok && !S.docPath) ctx.timeout(function () { poll() }, 50)
          return {
            ok: ok,
            sessionId: S.sessionId,
            cwd: S.cwd,
            source: S.bindSource,
            ownerLocked: S.ownerLocked,
            ownerVerified: S.ownerVerified,
            note: S.switchNote,
          }
        } catch (e) {
          S.lastError = 'bind: ' + msg(e)
          return { ok: false, reason: msg(e) }
        }
      })

      // 指定 sessionId 时：现场实测「那一个会话」并直接返回，完全不依赖全局绑定。
      // 这样每个对话里显示的，永远是它自己的占用，与别的对话无关 —— 从结构上消除绑错的可能。
      harness.handle('status', function (args) {
        try {
          const want = args && typeof args.sessionId === 'string' ? args.sessionId : null
          if (want && want !== S.sessionId) {
            const s = findSession(sessions, want)
            const m = s ? readMetrics(s, projections, meter) : null
            if (m) {
              const win = num(m.win)
              const pj = num(m.projected)
              const raw = win > 0 ? pj / win * 100 : 0
              return {
                live: true,
                error: null,
                sessionId: want,
                short: String(want).slice(8, 16),
                winTokens: win,
                surface: num(m.surface),
                pressure: num(m.pressure),
                projected: pj,
                percent: Math.min(100, Math.round(raw)),
                pctX10: Math.round(raw * 10) / 10,
                band: bandOf(Math.round(raw)),
                metricSource: m.source,
                followed: S.sessionId,
                docPath: null,
                milestones: MILESTONES.slice(0),
                nextMilestone: (function () {
                  for (let i = 0; i < MILESTONES.length; i++) { if (MILESTONES[i] > raw) return MILESTONES[i] }
                  return 0
                })(),
                reached: 0,
                marks: [],
              }
            }
          }
        } catch (e) { S.lastError = 'status.live: ' + msg(e) }
        return {
          phase: S.phase,
          error: S.error || S.lastError || null,
          caps: S.caps,
          sessionId: S.sessionId,
          short: S.sessionId ? String(S.sessionId).slice(8, 16) : null,
          cwd: S.cwd,
          docPath: S.docPath,
          winTokens: S.winTokens,
          surface: S.surface,
          pressure: S.pressure,
          projected: S.projected,
          percent: S.percent,
          band: bandOf(S.percent),
          metricSource: S.metricSource,
          nodeCount: S.nodeCount,
          sysTokens: S.sysTokens,
          histTokens: S.histTokens,
          top: S.top.slice(0, TOP_K),
          turns: S.turns,
          steps: S.steps,
          reached: S.reached,
          milestones: MILESTONES.slice(0),
          nextMilestone: nextMilestone(),
          marks: S.marks.map(function (m) { return { pct: m.pct, at: m.at, percent: m.percent, projected: m.projected, nodes: m.nodes } }),
          writes: S.writes,
          lastWriteAt: S.lastWriteAt,
          writeReason: S.writeReason,
          fullSince: S.fullSince,
          reminderCount: S.reminder.count,
          reminderAt: S.reminder.at,
          polls: S.polls,
          evts: S.evts,
          preSteps: S.preSteps,
          pctX10: S.pctX10,
          lastPollAt: S.lastPollAt,
          bindSource: S.bindSource,
          ownerLocked: S.ownerLocked,
          ownerVerified: S.ownerVerified,
          baselined: S.baselined,
          switchNote: S.switchNote,
          startedAt: S.startedAt,
        }
      })

      // 这里刻意不注册任何动态工具：工具 schema 会进入每一次请求的提示词，
      // 与「不消耗 token」的目标冲突。要让 AI 知道占用，靠 agent/pre-step 注入与本文件。
    } catch (e) {
      S.phase = 'error'
      S.error = msg(e)
      try { console.error('[ctx-budget] apply failed: ' + msg(e)) } catch (e2) { /* ignore */ }
    }
  },
}
