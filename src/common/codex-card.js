export const CODEX_CARD_ID = 'codex.rate-limits'
export const CODEX_SCHEMA_VERSION = 1
export const CODEX_CACHE_KEY = 'codex.rate-limits.snapshot.v1'
export const CODEX_DOUBLE_TAP_MS = 420
export const CODEX_DOUBLE_TAP_DISTANCE = 44
export const CODEX_LOADING_TIMEOUT_MS = 18000

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Business 5× for this plan was explicitly confirmed by the user on 2026-09-22.
// It is a display label, not a multiplier inferred from a quota percentage.
// Pro tiers follow the official desktop billing mapping verified 2026-09-23:
// pro = Pro 20x, prolite = Pro 5x. See docs/subscription-tiers.md.
export const CODEX_PLAN_LABELS = {
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro 20×',
  prolite: 'Pro 5×',
  team: 'Business',
  self_serve_business_prolite: 'Business 5×',
  self_serve_business_usage_based: 'Business',
  business: 'Business',
  ent26: 'Enterprise',
  enterprise_cbp_automation: 'Enterprise',
  enterprise_cbp_usage_based: 'Enterprise',
  enterprise: 'Enterprise',
  edu: 'Edu',
  edu_plus: 'Edu Plus',
  edu_pro: 'Edu Pro'
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value))
}

function parseInput(input) {
  if (typeof input === 'string') {
    try { return JSON.parse(input) } catch (error) { return null }
  }
  return input && typeof input === 'object' ? input : null
}

function normalizedWindow(window) {
  if (!window || typeof window !== 'object' || typeof window.id !== 'string') return null
  if (!finite(window.windowDurationMins) || window.windowDurationMins <= 0 || !finite(window.resetsAt)) return null
  const used = finite(window.usedPercent) ? clampPercent(window.usedPercent) : null
  const remaining = finite(window.remainingPercent)
    ? clampPercent(window.remainingPercent)
    : used === null ? null : 100 - used
  if (remaining === null) return null
  return {
    id: window.id,
    label: typeof window.label === 'string' ? window.label : '',
    usedPercent: used === null ? 100 - remaining : used,
    remainingPercent: remaining,
    windowDurationMins: window.windowDurationMins,
    resetsAt: window.resetsAt
  }
}

export function parseCodexSnapshot(input) {
  const message = parseInput(input)
  if (!message || message.schemaVersion !== CODEX_SCHEMA_VERSION || message.type !== 'snapshot' || message.cardId !== CODEX_CARD_ID) return null
  if (typeof message.sourceId !== 'string' || typeof message.sessionId !== 'string' || !finite(message.revision) || message.revision < 0) return null
  if (!finite(message.fetchedAt) || !finite(message.expiresAt) || message.expiresAt < message.fetchedAt) return null
  const payload = message.payload
  if (!payload || !Array.isArray(payload.windows) || payload.windows.length === 0) return null
  const windows = payload.windows.map(normalizedWindow).filter(Boolean)
  if (windows.length === 0) return null
  const selectedId = typeof payload.selectedWindowId === 'string' ? payload.selectedWindowId : ''
  const selected = windows.find(window => window.id === selectedId) || windows.slice().sort((a, b) => b.windowDurationMins - a.windowDurationMins)[0]
  return {
    schemaVersion: CODEX_SCHEMA_VERSION,
    type: 'snapshot',
    cardId: CODEX_CARD_ID,
    sourceId: message.sourceId,
    accountKey: typeof message.accountKey === 'string' ? message.accountKey : 'default',
    revision: Math.floor(message.revision),
    sessionId: message.sessionId,
    fetchedAt: message.fetchedAt,
    expiresAt: message.expiresAt,
    payload: {
      selectedWindowId: selected.id,
      windows,
      usage: payload.usage || null,
      planType: Object.prototype.hasOwnProperty.call(CODEX_PLAN_LABELS, payload.planType) ? payload.planType : null
    },
    selected
  }
}

export function isNewerCodexSnapshot(currentSessionId, currentRevision, next) {
  if (!next) return false
  return next.sessionId !== currentSessionId || next.revision > currentRevision
}

export function codexDoubleTap(previous, at, point) {
  const x = point && finite(point.x) ? point.x : point && point.clientX
  const y = point && finite(point.y) ? point.y : point && point.clientY
  if (!finite(at) || !finite(x) || !finite(y)) return { triggered: false, next: null }
  const next = { at, x, y }
  if (!previous || !finite(previous.at) || !finite(previous.x) || !finite(previous.y)) return { triggered: false, next }
  const delay = at - previous.at
  const distance = Math.max(Math.abs(x - previous.x), Math.abs(y - previous.y))
  if (delay > 0 && delay <= CODEX_DOUBLE_TAP_MS && distance <= CODEX_DOUBLE_TAP_DISTANCE) {
    return { triggered: true, next: null }
  }
  return { triggered: false, next }
}

export function codexWindowLabel(minutes) {
  if (minutes >= 7 * 24 * 60) return '本周剩余'
  if (minutes >= 60 && minutes % 60 === 0 && minutes <= 24 * 60) return (minutes / 60) + '小时剩余'
  return '短时剩余'
}

export function codexPlanLabel(planType) {
  return CODEX_PLAN_LABELS[planType] || 'ChatGPT'
}

export function codexResetText(resetsAt, now) {
  const remaining = resetsAt - now
  if (remaining <= 0) return '等待更新'
  if (remaining >= DAY) {
    const days = Math.floor(remaining / DAY)
    const hours = Math.floor((remaining % DAY) / HOUR)
    if (days > 99) return '99天以上重置'
    if (days >= 7) return days + '天后重置'
    return days + '天' + (hours ? hours + '小时' : '') + '后重置'
  }
  if (remaining >= HOUR) return '' + Math.max(1, Math.ceil(remaining / HOUR)) + '小时后重置'
  return '' + Math.max(1, Math.ceil(remaining / MINUTE)) + '分后重置'
}

export function codexCardState(snapshot, now, connected) {
  if (!snapshot) return {
    percentText: '—%', windowText: '本周剩余', resetText: '等待更新', freshText: connected ? '等待 Mac' : '连接断开',
    planText: 'ChatGPT', remainingPercent: 0, stale: true, warning: true, hasData: false
  }
  const window = snapshot.selected
  const stale = now > snapshot.expiresAt
  const age = Math.max(0, now - snapshot.fetchedAt)
  let freshText = age < MINUTE ? '刚刚更新' : Math.min(99, Math.floor(age / MINUTE)) + '分前'
  if (stale) freshText = '数据过期'
  else if (!connected) freshText = '连接断开'
  return {
    percentText: Math.round(window.remainingPercent) + '%',
    windowText: codexWindowLabel(window.windowDurationMins),
    resetText: codexResetText(window.resetsAt, now),
    freshText,
    planText: codexPlanLabel(snapshot.payload.planType),
    remainingPercent: window.remainingPercent,
    stale,
    warning: stale || !connected,
    hasData: true
  }
}

export function codexAck(snapshot, now) {
  return {
    schemaVersion: CODEX_SCHEMA_VERSION,
    type: 'ack',
    cardId: CODEX_CARD_ID,
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    appliedAt: now
  }
}

export function codexRefreshRequest(sessionId, revision, now) {
  return {
    schemaVersion: CODEX_SCHEMA_VERSION,
    type: 'refresh_request',
    cardId: CODEX_CARD_ID,
    sessionId: sessionId || '',
    lastRevision: Math.max(0, revision || 0),
    requestedAt: now
  }
}

export function codexTextAsset(kind, text) {
  return 'codex-v082-' + kind + '-' + String(text).split('').map(char => char.charCodeAt(0).toString(16)).join('-')
}
