import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const moduleCache=new Map()
function moduleURL(file,parent=import.meta.url){
  const url=new URL(file,parent);if(!url.pathname.endsWith('.js'))url.pathname+='.js'
  if(moduleCache.has(url.href))return moduleCache.get(url.href)
  const source=readFileSync(url,'utf8').replace(/from ['"](\.[^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(moduleURL(dep,url)))
  const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');moduleCache.set(url.href,result);return result
}
const { codexAck, codexCardState, codexDoubleTap, codexPlanLabel, codexRefreshRequest, isNewerCodexSnapshot, parseCodexSnapshot } = await import(moduleURL('../src/common/codex-card.js'))

const now = 1790000000000
const message = overrides => ({
  schemaVersion: 1,
  type: 'snapshot',
  cardId: 'codex.rate-limits',
  sourceId: 'mac-test',
  accountKey: 'default',
  revision: 7,
  sessionId: 'session-a',
  fetchedAt: now,
  expiresAt: now + 10 * 60 * 1000,
  payload: {
    planType: 'self_serve_business_prolite',
    selectedWindowId: 'codex.primary',
    windows: [{ id: 'codex.primary', label: '本周', usedPercent: 3, remainingPercent: 97, windowDurationMins: 10080, resetsAt: now + 5 * 86400000 + 8 * 3600000 }]
  },
  ...overrides
})

test('valid snapshots normalize the selected window and card copy', () => {
  const snapshot = parseCodexSnapshot(JSON.stringify(message()))
  assert.equal(snapshot.selected.id, 'codex.primary')
  assert.equal(snapshot.selected.remainingPercent, 97)
  assert.deepEqual(codexCardState(snapshot, now, true), {
    percentText: '97%', windowText: '本周剩余', resetText: '5天8小时后重置', freshText: '刚刚更新',
    planText: 'Business 5×', remainingPercent: 97, stale: false, warning: false, hasData: true
  })
  assert.equal(codexCardState(snapshot, now + 11 * 60 * 1000, true).freshText, '数据过期')
  assert.equal(codexCardState(snapshot, now, false).warning, true)
  assert.equal(codexCardState(snapshot, now + 11 * 60 * 1000, true).warning, true)
})

test('plan labels use verified compact fallbacks', () => {
  assert.equal(codexPlanLabel('pro'), 'Pro 20×')
  assert.equal(codexPlanLabel('prolite'), 'Pro 5×')
  for (const [planType, expected] of [['pro', 'Pro 20×'], ['prolite', 'Pro 5×']]) {
    const snapshot = parseCodexSnapshot(message({ payload: { ...message().payload, planType } }))
    assert.equal(codexCardState(snapshot, now, true).planText, expected)
  }
  assert.equal(codexPlanLabel('self_serve_business_prolite'), 'Business 5×')
  assert.equal(codexPlanLabel('future_plan'), 'ChatGPT')
  const unknown = parseCodexSnapshot(message({ payload: { ...message().payload, planType: 'future_plan' } }))
  assert.equal(unknown.payload.planType, null)
  assert.equal(codexCardState(unknown, now, true).planText, 'ChatGPT')
})

test('invalid and reordered snapshots fail closed', () => {
  assert.equal(parseCodexSnapshot('{'), null)
  assert.equal(parseCodexSnapshot(message({ schemaVersion: 2 })), null)
  assert.equal(parseCodexSnapshot(message({ expiresAt: now - 1 })), null)
  assert.equal(parseCodexSnapshot(message({ payload: { windows: [] } })), null)
  const snapshot = parseCodexSnapshot(message())
  assert.equal(isNewerCodexSnapshot('session-a', 7, snapshot), false)
  assert.equal(isNewerCodexSnapshot('session-a', 6, snapshot), true)
  assert.equal(isNewerCodexSnapshot('session-b', 99, snapshot), true)
})

test('missing data, acknowledgements and refresh messages remain explicit', () => {
  assert.equal(codexCardState(null, now, false).freshText, '连接断开')
  assert.equal(codexCardState(null, now, true).freshText, '等待 Mac')
  const snapshot = parseCodexSnapshot(message())
  assert.deepEqual(codexAck(snapshot, now + 1), {
    schemaVersion: 1, type: 'ack', cardId: 'codex.rate-limits', sessionId: 'session-a', revision: 7, appliedAt: now + 1
  })
  assert.deepEqual(codexRefreshRequest('session-a', 7, now + 2), {
    schemaVersion: 1, type: 'refresh_request', cardId: 'codex.rate-limits', sessionId: 'session-a', lastRevision: 7, requestedAt: now + 2
  })
})

test('double tap accepts the whole card but rejects slow, distant and malformed pairs', () => {
  const first = codexDoubleTap(null, now, { clientX: 40, clientY: 120 })
  assert.equal(first.triggered, false)
  assert.equal(codexDoubleTap(first.next, now + 280, { clientX: 70, clientY: 145 }).triggered, true)
  assert.equal(codexDoubleTap(first.next, now + 421, { clientX: 40, clientY: 120 }).triggered, false)
  assert.equal(codexDoubleTap(first.next, now + 200, { clientX: 90, clientY: 120 }).triggered, false)
  assert.deepEqual(codexDoubleTap(first.next, now + 200, null), { triggered: false, next: null })
})


test('every countdown and whole-row quota state has a packaged image in both orientations', async () => {
  const { existsSync } = await import('node:fs')
  const { codexResetText, codexTextAsset, CODEX_PLAN_LABELS, codexWindowLabel } = await import(moduleURL('../src/common/codex-card.js'))
  const names = new Set(['codex-v082-logo','codex-v082-ring-empty'])
  for(let p=0;p<=100;p++)names.add('codex-v082-ring-'+p)
  for(const text of ['ChatGPT',...Object.values(CODEX_PLAN_LABELS)])names.add(codexTextAsset('plan',text))
  for(const minutes of [1,59,60,90,300,1440,10080])names.add(codexTextAsset('window',codexWindowLabel(minutes)))
  for(const offset of [-1,0,...Array.from({length:61},(_,n)=>n*60000),...Array.from({length:2401},(_,n)=>n*3600000),200*86400000])names.add(codexTextAsset('reset',codexResetText(now+offset,now)))
  for(const age of [0,60000,9*60000,11*60000])for(const connected of [true,false])names.add(codexTextAsset('fresh',codexCardState(parseCodexSnapshot(message()),now+age,connected).freshText))
  for(const direction of ['forward','reverse'])for(const name of names)assert.ok(existsSync(new URL('../src/common/physical/'+direction+'/'+name+'.png',import.meta.url)),name)
})
