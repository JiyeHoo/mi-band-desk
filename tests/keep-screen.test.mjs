import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/common/keep-screen.js', import.meta.url), 'utf8')
const { default: createKeepScreen } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
function setup() {
  let time = 1000
  const calls = []
  let state
  const controller = createKeepScreen({ setKeepScreenOn: (call) => calls.push(call) }, (value) => { state = value }, () => time)
  return { controller, calls, state: () => state, advance: (ms) => { time += ms } }
}
test('only reports enabled after API acknowledgement; hide releases it', () => {
  const h = setup()
  h.controller.show(); h.calls.at(-1).success()
  h.controller.select(30)
  assert.equal(h.state().state, 'pending')
  h.calls.at(-1).success()
  assert.equal(h.state().state, 'on')
  h.controller.hide()
  assert.equal(h.calls.at(-1).keepScreenOn, false)
})
test('releases at the deadline and does not restart an expired session', () => {
  const h = setup()
  h.controller.show(); h.controller.select(30); h.calls.at(-1).success()
  h.advance(30 * 60000 - 1); h.controller.tick()
  assert.equal(h.state().state, 'on')
  h.advance(1); h.controller.tick()
  assert.equal(h.calls.at(-1).keepScreenOn, false)
  assert.equal(h.state().deadline, 0)
  h.controller.show()
  assert.equal(h.calls.at(-1).keepScreenOn, false)
})
test('hide/show retains the original deadline rather than extending it', () => {
  const h = setup()
  h.controller.show(); h.controller.select(30)
  const deadline = h.state().deadline
  h.controller.hide(); h.advance(10000); h.controller.show()
  assert.equal(h.state().deadline, deadline)
  assert.equal(h.calls.at(-1).keepScreenOn, true)
  h.controller.hide(); h.advance(30 * 60000); h.controller.show()
  assert.equal(h.calls.at(-1).keepScreenOn, false)
})
test('late enable callback after exit triggers another release', () => {
  const h = setup()
  h.controller.show(); h.controller.select(30)
  const late = h.calls.at(-1)
  h.controller.dispose(); h.calls.at(-1).success()
  const length = h.calls.length
  late.success()
  assert.equal(h.calls.length, length + 1)
  assert.equal(h.calls.at(-1).keepScreenOn, false)
  assert.equal(h.state().state, 'off')
})
test('failed or missing API cannot be reported as enabled', () => {
  const h = setup()
  h.controller.show(); h.controller.select(30)
  h.calls.at(-1).fail({}, 203)
  assert.equal(h.state().state, 'error')
  assert.equal(h.state().error, '203')
  let state
  const missing = createKeepScreen({}, (value) => { state = value })
  missing.show()
  assert.equal(state.state, 'error')
})
