/**
 * Host core — GENERATED from a dynamic Cordis package by
 * tools/build-permanent-plugin.mjs. Do not hand-edit: regenerate instead, so the
 * behaviour stays identical to the version that was reviewed and approved.
 *
 * The body keeps the sandbox's shape: free symbols `ctx` and `harness`, ending
 * in `return { apply(ctx) { … } }`.
 */
/* eslint-disable */
export async function createCore(ctx, harness) {
const PRICING = {
  source: 'api-docs.deepseek.com/quick_start/pricing',
  verifiedAt: '2026-09-19',
  models: {
    'deepseek-flash': {
      label: 'deepseek-flash',
      peak: { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
      offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
    },
    'deepseek-v4-pro': {
      label: 'deepseek-v4-pro',
      peak: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
      offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
    },
  },
}

const PEAK_WINDOWS = [[1, 4], [6, 10]]
const REFRESH_WINDOW_MS = 7 * 86400000
const MAX_CACHE_AGE_MS = 3 * 86400000
const CACHE_BASENAME = '.dsh-peak-valley.json'
const FETCH_URL_LIMIT = 3
const MIN_WEB_RANGES = 5
const NAME_TOKENS = ['元旦', '春节', '清明', '劳动', '五一', '端午', '中秋', '国庆']

// 国务院办公厅 2026 年节假日安排（内置基准；已与官方原文逐条比对一致）
const SEED_HOLIDAYS = [
  { name: '元旦', start: '2026-01-01', end: '2026-01-03' },
  { name: '春节', start: '2026-02-15', end: '2026-02-23' },
  { name: '清明节', start: '2026-04-04', end: '2026-04-06' },
  { name: '劳动节', start: '2026-05-01', end: '2026-05-05' },
  { name: '端午节', start: '2026-06-19', end: '2026-06-21' },
  { name: '中秋节', start: '2026-09-25', end: '2026-09-27' },
  { name: '国庆节', start: '2026-10-01', end: '2026-10-07' },
]

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

function utcDayKey(ms) {
  const d = new Date(ms)
  return d.getUTCFullYear() + '-' + MONTHS[d.getUTCMonth()] + '-' + pad(d.getUTCDate())
}

function utcDayStart(ms) {
  return Math.floor(ms / 86400000) * 86400000
}

function normalizeHolidays(input) {
  const out = []
  if (Array.isArray(input)) {
    for (const h of input) {
      if (!h || typeof h.start !== 'string' || typeof h.end !== 'string') continue
      if (!/^\d{4}-\d{2}-\d{2}$/.test(h.start) || !/^\d{4}-\d{2}-\d{2}$/.test(h.end)) continue
      if (h.end < h.start) continue
      out.push({ name: typeof h.name === 'string' && h.name ? h.name : '节假日', start: h.start, end: h.end })
    }
  }
  return out
}

function holidayDays(holidays) {
  const days = new Set()
  for (const h of holidays) {
    const start = Date.parse(h.start + 'T00:00:00.000Z')
    const end = Date.parse(h.end + 'T00:00:00.000Z')
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
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
  if (cal && cal.days.has(utcDayKey(t))) return false
  const hour = d.getUTCHours()
  for (const w of PEAK_WINDOWS) {
    if (hour >= w[0] && hour < w[1]) return true
  }
  return false
}

function periodState(now, cal) {
  const peak = inside(now, cal)
  let nextAt = null
  for (let i = 1; i <= 8 * 24 * 60; i += 1) {
    const t = Math.floor(now / 60000) * 60000 + i * 60000
    if (inside(t, cal) !== peak) {
      nextAt = t
      break
    }
  }
  return { peak: peak, tariff: peak ? 'peak' : 'off-peak', nextChangeAt: nextAt }
}

function nextHoliday(now, holidays) {
  const today = utcDayKey(utcDayStart(now))
  let best = null
  for (const h of holidays) {
    if (h.end < today) continue
    if (best === null || h.start < best.start) best = h
  }
  return best
}

function validMonthDay(m, d) {
  if (!Number.isInteger(m) || !Number.isInteger(d)) return false
  if (m < 1 || m > 12) return false
  return d >= 1 && d <= DAYS_IN_MONTH[m - 1]
}

function iso(year, m, d) {
  return String(year) + '-' + MONTHS[m - 1] + '-' + pad(d)
}

function fullName(token) {
  if (token === '元旦') return '元旦'
  if (token === '春节') return '春节'
  if (token === '清明') return '清明节'
  if (token === '劳动' || token === '五一') return '劳动节'
  if (token === '端午') return '端午节'
  if (token === '中秋') return '中秋节'
  if (token === '国庆') return '国庆节'
  return token
}

function plausibleRange(list) {
  for (const h of list) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h.start) || !/^\d{4}-\d{2}-\d{2}$/.test(h.end)) return false
    if (h.end < h.start) return false
    const start = Date.parse(h.start + 'T00:00:00.000Z')
    const end = Date.parse(h.end + 'T00:00:00.000Z')
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false
    if (end - start > 15 * 86400000) return false
  }
  return true
}

function toPlainText(html) {
  if (typeof html !== 'string') return ''
  let text = html.replace(/<!--[\s\S]*?-->/g, '')
  text = text.replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, '')
  text = text.replace(/<\s*br\s*\/?\s*>/gi, '\n')
  text = text.replace(/<\s*\/\s*(p|div|tr|li|h[1-6]|table)\s*>/gi, '\n')
  text = text.replace(/<[^>]*>/g, '')
  text = text.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
  text = text.replace(/[ \t\u3000]+/g, ' ')
  text = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).join('\n')
  return text
}

function rangeFromMatch(match, year) {
  const m1 = Number(match[1])
  const d1 = Number(match[2])
  const m2 = match[3] === undefined ? m1 : Number(match[3])
  const d2 = Number(match[4])
  if (!validMonthDay(m1, d1) || !validMonthDay(m2, d2)) return null
  const start = iso(year, m1, d1)
  let end = iso(year, m2, d2)
  if (end < start) end = iso(year + 1, m2, d2)
  if (end < start) return null
  if (Date.parse(end + 'T00:00:00.000Z') - Date.parse(start + 'T00:00:00.000Z') > 15 * 86400000) return null
  return { start: start, end: end }
}

function extractRangesDiagnostic(text, year) {
  const diag = { ranges: null, anchor: 0, ranged: 0, reason: null, sample: null, textLength: typeof text === 'string' ? text.length : 0 }
  if (typeof text !== 'string' || text.length === 0) {
    diag.reason = 'empty text'
    return diag
  }
  const yearIndex = text.indexOf(String(year))
  if (yearIndex < 0) {
    diag.reason = 'year ' + String(year) + ' not in text'
    diag.sample = text.slice(0, 200)
    return diag
  }
  diag.sample = text.slice(Math.max(0, yearIndex - 40), yearIndex + 300)
  for (const token of NAME_TOKENS) {
    if (text.indexOf(token) >= 0) diag.anchor += 1
  }
  const found = new Map()
  // 区间不得跨行，且 “至” 前的间隔不超过 18 字（防止吞并相邻条目）
  const pattern = /(\d{1,2})\s*月\s*(\d{1,2})\s*日[^\n]{0,18}?[至到~\-—][^\n]{0,8}?(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*日/g
  let match = pattern.exec(text)
  while (match !== null) {
    const range = rangeFromMatch(match, year)
    if (range !== null) {
      diag.ranged += 1
      const before = text.slice(0, match.index)
      let bestName = null
      let bestAt = -1
      for (const token of NAME_TOKENS) {
        const at = before.lastIndexOf(token)
        if (at > bestAt) {
          bestAt = at
          bestName = token
        }
      }
      if (bestName !== null && match.index - bestAt <= 60) {
        const key = fullName(bestName)
        if (!found.has(key)) found.set(key, range)
      }
    }
    match = pattern.exec(text)
  }
  if (diag.anchor === 0) {
    diag.reason = 'no holiday anchors found'
    return diag
  }
  if (found.size === 0) {
    diag.reason = 'anchors=' + String(diag.anchor) + ', ranges=' + String(diag.ranged) + ' but none attributable'
    return diag
  }
  const list = []
  for (const token of NAME_TOKENS) {
    const range = found.get(fullName(token))
    if (range === undefined) continue
    list.push({ name: fullName(token), start: range.start, end: range.end })
  }
  if (!plausibleRange(list)) {
    diag.reason = 'implausible ranges'
    return diag
  }
  diag.ranges = list
  return diag
}

function readContent(result) {
  let text = ''
  if (result && typeof result.content === 'string') text += result.content + '\n'
  const sources = result && Array.isArray(result.sources) ? result.sources : []
  for (const s of sources) {
    if (!s || typeof s !== 'object') continue
    if (typeof s.title === 'string') text += s.title + '\n'
    if (typeof s.snippet === 'string') text += s.snippet + '\n'
  }
  return text
}

function pageText(result) {
  if (!result || typeof result !== 'object') return null
  if (typeof result.statusCode === 'number' && (result.statusCode < 200 || result.statusCode >= 300)) return null
  const body = result.body
  if (!body || typeof body !== 'object' || typeof body.content !== 'string') return null
  const raw = body.content
  const cut = raw.indexOf('扫一扫')
  const head = cut > 20000 ? raw.slice(0, cut) : raw
  return head.length > 0 ? head : null
}

function candidateScore(url, title) {
  let score = 0
  if (/(^|\.)gov\.cn([/:]|$)/.test(url)) score += 4
  const name = typeof title === 'string' ? title : ''
  if (name.indexOf('节假日') >= 0) score += 3
  if (name.indexOf('放假') >= 0) score += 2
  if (name.indexOf('通知') >= 0) score += 1
  if (name.indexOf('国务院办公厅') >= 0) score += 1
  return score
}

return {
  inject: ['timer'],
  apply(ctx) {
    const sessions = ctx.get('sessions')
    const fs = ctx.get('fs')

    let holidays = SEED_HOLIDAYS.slice()
    let days = holidayDays(holidays)
    let calendarSource = 'builtin'
    let calendarRefreshedAt = null
    let verifiedUntil = null
    let lastAttemptAt = 0
    let refreshing = false
    let loaded = false
    let cacheTarget = null
    let baseDir = null
    let lastError = null
    let lastSearchStats = null
    let lastMatches = null
    let lastCompleteness = null
    let refreshPromise = null

    const nowMs = () => Date.now()
    const calendar = () => ({ holidays: holidays, days: days, source: calendarSource, refreshedAt: calendarRefreshedAt, verifiedUntil: verifiedUntil })

    function retentionOk(t) {
      if (calendarSource.indexOf('web') !== 0) return true
      if (calendarRefreshedAt === null) return false
      if (t - calendarRefreshedAt <= MAX_CACHE_AGE_MS) return true
      return nextHoliday(t, holidays) === null
    }

    function needsRefresh(t) {
      const next = nextHoliday(t, holidays)
      if (next === null) return false
      const start = Date.parse(next.start + 'T00:00:00.000Z')
      if (!Number.isFinite(start)) return false
      if (start - t > REFRESH_WINDOW_MS) return false
      if (!retentionOk(t)) return true
      if (calendarRefreshedAt === null) return true
      return t - calendarRefreshedAt > MAX_CACHE_AGE_MS
    }

    function resolveBaseDir() {
      if (sessions === undefined || typeof sessions.list !== 'function') return null
      let list = []
      try {
        list = sessions.list()
      } catch (error) {
        list = []
      }
      for (const s of Array.isArray(list) ? list : []) {
        const header = s && s.header ? s.header : undefined
        if (header && typeof header.cwd === 'string' && header.cwd) return header.cwd
      }
      return null
    }

    async function ensureTarget() {
      if (cacheTarget !== null) return true
      if (fs === undefined || typeof fs.resolve !== 'function') return false
      if (baseDir === null) baseDir = resolveBaseDir()
      if (!baseDir) return false
      try {
        cacheTarget = await fs.resolve(baseDir + '\\' + CACHE_BASENAME)
        return true
      } catch (error) {
        lastError = 'resolve: ' + (error && error.message ? error.message : String(error))
        return false
      }
    }

    async function loadCache() {
      if (loaded) return
      if (!(await ensureTarget())) return
      loaded = true
      try {
        const raw = await fs.readText(cacheTarget)
        const parsed = JSON.parse(raw)
        const list = normalizeHolidays(parsed && parsed.holidays)
        if (list.length > 0) {
          holidays = list
          days = holidayDays(holidays)
          calendarSource = typeof parsed.source === 'string' && parsed.source ? parsed.source : 'web'
          calendarRefreshedAt = typeof parsed.refreshedAt === 'number' ? parsed.refreshedAt : null
          verifiedUntil = typeof parsed.verifiedUntil === 'number' ? parsed.verifiedUntil : null
          console.log('[peak-valley] calendar loaded from cache: ' + holidays.length + ' ranges')
        }
      } catch (error) {
        /* an absent or unreadable cache is normal */
      }
    }

    async function saveCache() {
      if (!(await ensureTarget())) {
        lastError = 'cache target unresolved (baseDir=' + String(baseDir) + ')'
        return false
      }
      try {
        const payload = JSON.stringify({
          version: 1,
          source: calendarSource,
          refreshedAt: calendarRefreshedAt,
          verifiedUntil: verifiedUntil,
          holidays: holidays,
        }, null, 2)
        await fs.writeText(cacheTarget, payload)
        return true
      } catch (error) {
        lastError = 'write: ' + (error && error.message ? error.message : String(error))
        console.log('[peak-valley] calendar cache write failed: ' + lastError)
        return false
      }
    }

    async function refreshCalendar() {
      const web = ctx.get('web')
      const t = nowMs()
      lastSearchStats = { queries: 0, sources: 0, fetched: 0, parsed: 0, errors: [], probes: [] }
      lastMatches = null
      lastCompleteness = null
      if (web === undefined || typeof web.search !== 'function') {
        verifiedUntil = t + 86400000
        lastError = 'web service unavailable'
        lastSearchStats.errors.push(lastError)
        return
      }
      const next = nextHoliday(t, holidays)
      const year = next ? Number(next.start.slice(0, 4)) : new Date(t).getUTCFullYear()
      const queries = [
        String(year) + '年节假日安排 国务院办公厅 通知 放假',
        String(year) + '年放假安排时间表 春节 国庆 调休',
      ]
      const candidates = []
      const seen = new Set()
      for (const q of queries) {
        lastSearchStats.queries += 1
        let result = null
        try {
          result = await web.search({ query: q, maxResults: 8 })
        } catch (error) {
          const message = 'search: ' + (error && error.message ? error.message : String(error))
          lastSearchStats.errors.push(message)
          lastError = message
          continue
        }
        if (result === null || result === undefined) {
          lastSearchStats.errors.push('search returned nothing')
          continue
        }
        const sources = Array.isArray(result.sources) ? result.sources : []
        lastSearchStats.sources += sources.length
        for (const s of sources) {
          if (!s || typeof s.url !== 'string' || !s.url) continue
          if (seen.has(s.url)) continue
          seen.add(s.url)
          candidates.push({ url: s.url, title: typeof s.title === 'string' ? s.title : '', score: candidateScore(s.url, s.title) })
        }
        const snippetText = readContent(result)
        const httpIndex = snippetText.indexOf('http')
        const snippetBody = httpIndex >= 0 ? snippetText.slice(0, httpIndex) : snippetText
        const fromSnippet = extractRangesDiagnostic(toPlainText(snippetBody), year)
        if (fromSnippet.ranges !== null && lastMatches === null) {
          lastMatches = { list: fromSnippet.ranges, url: result.sources && result.sources[0] ? result.sources[0].url : undefined, via: 'snippet' }
        }
      }
      candidates.sort((a, b) => b.score - a.score)
      const fetchable = candidates.filter((c) => c.score >= 3).slice(0, FETCH_URL_LIMIT)
      const fetchOne = async (candidate) => {
        if (typeof web.fetch !== 'function') return { url: candidate.url, text: null, error: 'web.fetch unavailable' }
        try {
          const page = await web.fetch({ url: candidate.url })
          const text = pageText(page)
          return { url: candidate.url, text: text, error: text === null ? 'fetch returned no text' : null }
        } catch (error) {
          return { url: candidate.url, text: null, error: 'fetch: ' + (error && error.message ? error.message : String(error)) }
        }
      }
      const pages = await Promise.all(fetchable.map(fetchOne))
      for (const page of pages) {
        lastSearchStats.fetched += 1
        if (page.text === null) {
          lastSearchStats.errors.push('fetch ' + page.url + ' -> ' + page.error)
          continue
        }
        const plain = toPlainText(page.text)
        const mention = plain.indexOf(String(year))
        const targetYear = mention >= 0 ? year : year + 1
        const diag = extractRangesDiagnostic(plain, targetYear)
        lastSearchStats.probes.push({
          url: page.url,
          textLength: diag.textLength,
          anchor: diag.anchor,
          ranged: diag.ranged,
          reason: diag.reason,
          sample: diag.sample === null ? null : diag.sample.slice(0, 160),
        })
        if (diag.ranges === null) {
          lastSearchStats.errors.push('parse ' + page.url + ' -> ' + String(diag.reason))
          continue
        }
        if (lastMatches === null || diag.ranges.length > lastMatches.list.length) {
          lastMatches = { list: diag.ranges, url: page.url, via: 'fetch' }
        }
      }
      if (lastMatches === null) {
        verifiedUntil = t + 86400000
        if (lastError === null) lastError = 'no authoritative holiday range extracted'
        console.log('[peak-valley] calendar refresh: nothing extracted')
        return
      }
      lastSearchStats.parsed = lastMatches.list.length
      const yearOf = Number(String(lastMatches.list[0].start).slice(0, 4))
      const seedForYear = holidays.filter((h) => h.start.slice(0, 4) === String(yearOf))
      const comparable = seedForYear.length > 0 ? seedForYear.length : SEED_HOLIDAYS.length
      lastCompleteness = {
        webRanges: lastMatches.list.length,
        referenceCount: comparable,
        threshold: MIN_WEB_RANGES,
        accepted: lastMatches.list.length >= MIN_WEB_RANGES,
      }
      if (lastMatches.list.length >= MIN_WEB_RANGES) {
        const merged = new Map()
        for (const h of holidays) merged.set(h.name + '@' + h.start, h)
        for (const h of lastMatches.list) merged.set(h.name + '@' + h.start, h)
        const list = Array.from(merged.values()).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
        holidays = list
        days = holidayDays(holidays)
        calendarSource = lastMatches.url ? 'web:' + lastMatches.url : 'web'
      } else {
        // 抓取结果明显不完整（本环境 web.fetch 只回传页面开头），保留内置基准表，不污染数据。
        calendarSource = 'builtin+web-partial'
        console.log('[peak-valley] web result incomplete (' + lastMatches.list.length + ' < ' + MIN_WEB_RANGES + '), keeping builtin calendar')
      }
      calendarRefreshedAt = t
      verifiedUntil = t + MAX_CACHE_AGE_MS
      lastError = null
      await saveCache()
      console.log('[peak-valley] calendar refresh done: source=' + calendarSource + ', ranges=' + lastMatches.list.length)
    }

    function markAttempt(t) {
      lastAttemptAt = t
      refreshing = true
      const run = refreshCalendar().then(
        () => {
          refreshing = false
          lastAttemptAt = nowMs()
        },
        (error) => {
          refreshing = false
          lastAttemptAt = nowMs()
          lastError = 'refresh threw: ' + (error && error.message ? error.message : String(error))
          console.log('[peak-valley] ' + lastError)
        },
      )
      refreshPromise = run
      return run
    }

    function modelInfo(session) {
      let provider = null
      let model = null
      let effort = null
      if (session !== undefined && session !== null && typeof session.snapshotEvents === 'function') {
        let events = []
        try {
          events = session.snapshotEvents()
        } catch (error) {
          events = []
        }
        for (const ev of Array.isArray(events) ? events : []) {
          if (!ev || typeof ev !== 'object') continue
          if (ev.type === 'request/header' && ev.data && ev.data.header && ev.data.header.config) {
            const config = ev.data.header.config
            if (typeof config.provider === 'string') provider = config.provider
            if (typeof config.model === 'string') model = config.model
            if (typeof config.reasoningEffort === 'string') effort = config.reasoningEffort
          } else if (ev.type === 'assistant/message' && ev.data && ev.data.message && ev.data.message.source) {
            const source = ev.data.message.source
            if (typeof source.provider === 'string') provider = source.provider
            if (typeof source.model === 'string') model = source.model
          }
        }
      }
      return { provider: provider, model: model, effort: effort }
    }

    function pickModel(model) {
      if (typeof model === 'string') {
        const key = model.trim().toLowerCase()
        if (Object.prototype.hasOwnProperty.call(PRICING.models, key)) return PRICING.models[key]
        if (key.indexOf('pro') >= 0) return PRICING.models['deepseek-v4-pro']
      }
      return PRICING.models['deepseek-flash']
    }

    async function snapshot(args) {
      await loadCache()
      const t = nowMs()
      if (!refreshing && t - lastAttemptAt > 300000 && needsRefresh(t)) markAttempt(t)
      const period = periodState(t, calendar())
      let session = null
      let cwd = baseDir
      if (sessions !== undefined && typeof sessions.get === 'function' && args && typeof args.sessionId === 'string') {
        try {
          session = sessions.get(args.sessionId)
        } catch (error) {
          session = null
        }
      }
      if (session && session.header && typeof session.header.cwd === 'string' && session.header.cwd) cwd = session.header.cwd
      const info = modelInfo(session)
      const entry = pickModel(info.model)
      let usageCalls = 0
      if (session !== null && typeof session.snapshotEvents === 'function') {
        try {
          for (const ev of session.snapshotEvents()) {
            if (ev && ev.type === 'assistant/message' && ev.data && ev.data.usage) usageCalls += 1
          }
        } catch (error) {
          usageCalls = 0
        }
      }
      const next = nextHoliday(t, holidays)
      return {
        now: t,
        period: period,
        pricing: {
          source: PRICING.source,
          verifiedAt: PRICING.verifiedAt,
          model: entry.label,
          requestedModel: info.model,
          provider: info.provider,
          effort: info.effort,
          peak: entry.peak,
          offPeak: entry.offPeak,
        },
        calendar: {
          source: calendarSource,
          refreshedAt: calendarRefreshedAt,
          verifiedUntil: verifiedUntil,
          holidays: holidays,
          next: next,
        },
        session: { id: args && typeof args.sessionId === 'string' ? args.sessionId : null, cwd: cwd, usageCalls: usageCalls },
      }
    }

    harness.handle('snapshot', snapshot)

    const calendarTool = harness.defineTool({
      name: 'peak_valley_calendar',
      description: 'Read the peak/off-peak calendar state of the running peak-valley plugin, or force an online holiday-calendar re-verification (refresh=true) and report the outcome.',
      parameters: {
        type: 'object',
        properties: {
          refresh: { type: 'boolean', description: 'When true, run online holiday verification now and wait for its result.' },
          force: { type: 'boolean', description: 'With refresh, ignore the 7-day/3-day gating and verify unconditionally.' },
        },
      },
      output: {
        schema: { type: 'json' },
        render(args, value) {
          return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
        },
      },
      async execute(args) {
        await loadCache()
        if (args && args.refresh === true) {
          if (args.force === true) {
            refreshing = false
            lastAttemptAt = 0
          }
          await markAttempt(nowMs())
        }
        const t = nowMs()
        const next = nextHoliday(t, holidays)
        const start = next ? Date.parse(next.start + 'T00:00:00.000Z') : null
        return {
          nowIso: new Date(t).toISOString(),
          period: periodState(t, calendar()),
          nextHoliday: next,
          daysUntilNextHoliday: start === null ? null : Math.floor((start - t) / 86400000),
          needsRefreshNow: needsRefresh(t),
          calendar: {
            source: calendarSource,
            refreshedAtIso: calendarRefreshedAt === null ? null : new Date(calendarRefreshedAt).toISOString(),
            verifiedUntilIso: verifiedUntil === null ? null : new Date(verifiedUntil).toISOString(),
            holidays: holidays,
          },
          matched: lastMatches,
          completeness: lastCompleteness,
          cache: { baseDir: baseDir, resolved: cacheTarget !== null, loaded: loaded, lastError: lastError },
          refreshState: { refreshing: refreshing, lastAttemptAtIso: lastAttemptAt === 0 ? null : new Date(lastAttemptAt).toISOString(), lastSearchStats: lastSearchStats },
        }
      },
    })
    harness.registerTool(ctx, calendarTool)

    ctx.interval(() => {
      const t = nowMs()
      if (!refreshing && t - lastAttemptAt > 300000 && needsRefresh(t)) markAttempt(t)
    }, 300000)

    ctx.timeout(() => {
      void loadCache().then(
        () => {
          const t = nowMs()
          if (!refreshing && needsRefresh(t)) markAttempt(t)
        },
        (error) => {
          lastError = 'startup: ' + (error && error.message ? error.message : String(error))
        },
      )
    }, 6000)
  },
}

}
