import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { scenes as sourceScenes, particles } from '../scripts/robot-scenes.mjs'

// Import the device modules, including their extensionless imports, in Node.
const moduleCache = new Map()
function moduleURL(file, parent = import.meta.url) {
  const url = new URL(file, parent)
  if (!url.pathname.endsWith('.js')) url.pathname += '.js'
  if (moduleCache.has(url.href)) return moduleCache.get(url.href)
  const source = readFileSync(url, 'utf8').replace(/from ['"](\.[^'"]+)['"]/g,
    (_, dependency) => 'from ' + JSON.stringify(moduleURL(dependency, url)))
  const result = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  moduleCache.set(url.href, result)
  return result
}
const animation = await import(moduleURL('../src/common/animation.js'))
const { BOXES, physicalRect } = await import(moduleURL('../src/common/layout.js'))

// Read choreography directly so its safety checks do not depend on stale generated assets.
const scenes = Object.fromEntries(Object.entries(sourceScenes).map(([name, source]) => [name, {
  ...source,
  motion: {
    left: source.left,
    right: source.right,
    gaze: source.gaze,
    effects: source.effects.map(effect => ({
      ...effect,
      frames: particles[effect.motion],
      duration: effect.duration || (effect.src.startsWith('hand-') ? source.duration
        : effect.motion.startsWith('rain') ? 900 : effect.motion === 'beat' ? 1800 : 2200)
    }))
  }
}]))
const pose = style => Object.fromEntries(style.split(';').filter(Boolean).map(item => {
  const [key, value] = item.split(':')
  return [key, parseFloat(value)]
}))
const box = style => {
  const { left, top, width, height } = pose(style)
  return [left, top, width, height]
}
const near = (actual, expected, tolerance = .002, message = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`)
const open = [[0, 0, 0], [100, 0, 0]]
const still = [[0, 0, 0, 0], [100, 0, 0, 0]]
const fixture = (gaze = still, effects = []) => ({
  duration: 1000,
  motion: { left: open, right: open, gaze, effects }
})

function sampleTimes(scene) {
  const times = new Set([0, scene.duration - .001, scene.duration, scene.duration + .001])
  for (let time = 0; time < scene.duration; time += animation.FRAME_MS) times.add(time)
  const tracks = [scene.motion.left, scene.motion.right, scene.motion.gaze]
    .map(frames => ({ frames, duration: scene.duration })).concat(scene.motion.effects)
  for (const { frames, duration } of tracks) for (const frame of frames) {
    const time = frame[0] * duration / 100
    for (const delta of [-.001, 0, .001]) times.add(Math.max(0, time + delta))
  }
  return [...times].sort((a, b) => a - b)
}

test('all 26 choreographies move both eyes and have finite positive native geometry', () => {
  assert.equal(Object.keys(scenes).length, 26)
  for (const [name, scene] of Object.entries(scenes)) {
    assert.ok(scene.duration > 0, name)
    assert.ok(Array.isArray(scene.motion.gaze), `${name} has explicit head movement`)
    const positions = { left: new Set(), right: new Set() }
    for (const time of sampleTimes(scene)) for (const flipped of [false, true]) {
      const frame = animation.sceneFrame(scene, time, flipped)
      for (const [key, style] of Object.entries(frame)) {
        assert.doesNotMatch(style, /NaN|Infinity|transform|rotate/, `${name} ${key}`)
        const values = pose(style)
        for (const property of ['left', 'top', 'width', 'height', 'opacity'])
          assert.ok(Number.isFinite(values[property]), `${name} ${key}.${property}`)
        assert.ok(values.width > 0 && values.height > 0, `${name} ${key} nonzero geometry`)
        assert.ok(values.opacity >= 0 && values.opacity <= 1, `${name} ${key} opacity`)
      }
      for (const side of ['left', 'right']) {
        const p = pose(frame[side + 'EyeStyle'])
        if (!flipped) positions[side].add(`${p.left},${p.top}`)
        assert.ok(p.left >= 0 && p.top >= 0 && p.left + p.width <= 192 && p.top + p.height <= 490,
          `${name} ${side} eye container remains on display`)
      }
    }
    for (const side of ['left', 'right'])
      assert.ok(positions[side].size > 1, `${name} ${side} animates position, not only eyelids`)
  }
})

test('forward and reverse frames preserve physical mapping and integer nonzero eyelids', () => {
  for (const [name, scene] of Object.entries(scenes)) for (const time of sampleTimes(scene)) {
    const logical = animation.sceneFrame(scene, time)
    const forward = animation.sceneFrame(scene, time, false)
    for (const flipped of [false, true]) {
      const native = flipped ? animation.sceneFrame(scene, time, true) : forward
      for (const side of ['left', 'right']) {
        assert.deepEqual(box(native[side + 'EyeStyle']), physicalRect(box(logical[side + 'EyeStyle']), flipped), name)
        const lids = animation.sample(scene.motion[side], time, scene.duration)
        for (const [index, lid] of ['Top', 'Bottom'].entries()) {
          const p = pose(native[side + lid]), height = Math.max(0, Math.min(128, lids[index]))
          for (const property of ['left', 'top', 'width', 'height']) assert.ok(Number.isInteger(p[property]), `${name} ${lid}`)
          assert.ok(p.width > 0 && p.height > 0)
          if (height <= .5) assert.equal(p.opacity, 0)
          else {
            const pixels = Math.max(1, Math.round(height))
            assert.equal(p.opacity, 1)
            assert.deepEqual(box(native[side + lid]), physicalRect([0, index ? 128 - pixels : 0, 128, pixels], flipped, 128, 128))
            assert.ok(p.left >= 0 && p.top >= 0 && p.left + p.width <= 128 && p.top + p.height <= 128)
          }
        }
      }
      for (let index = 0; index < scene.motion.effects.length; index++) {
        const key = 'effect' + index + 'Motion', actual = box(native[key])
        const expected = physicalRect(box(logical[key]), flipped)
        // Logical preview CSS keeps three decimals; the native box rounds the
        // original number first, so a .4999 coordinate may print as .500.
        for (let axis = 0; axis < 4; axis++) {
          assert.ok(Number.isInteger(actual[axis]))
          near(actual[axis], expected[axis], .501, `${name} effect ${index} axis ${axis}`)
        }
        if (flipped) {
          const [x, y, width, height] = box(forward[key])
          assert.deepEqual(actual, [192 - x - width, 490 - y - height, width, height], `${name} mirrored effect ${index}`)
        }
      }
    }
  }
})

test('every eye loop returns to rest and each visible particle loop crosses its boundary continuously', () => {
  for (const [name, scene] of Object.entries(scenes)) {
    for (const flipped of [false, true]) {
      const first = animation.sceneFrame(scene, 0, flipped)
      const last = animation.sceneFrame(scene, scene.duration - .001, flipped)
      const next = animation.sceneFrame(scene, scene.duration, flipped)
      for (const side of ['left', 'right']) {
        assert.deepEqual(box(first[side + 'EyeStyle']), physicalRect(BOXES[side + 'Eye'], flipped), `${name} starts at rest`)
        for (const suffix of ['EyeStyle', 'Top', 'Bottom']) {
          const key = side + suffix
          assert.equal(next[key], first[key], `${name} ${key} exact repeat`)
          for (const [property, value] of Object.entries(pose(first[key])))
            near(pose(last[key])[property], value, .002, `${name} ${key}.${property} loop boundary`)
        }
      }
    }
    for (const effect of scene.motion.effects) {
      // Isolate the particle clock from the independent head-motion clock.
      const particleScene = fixture(still, [effect])
      const first = pose(animation.sceneFrame(particleScene, 0, false).effect0Motion)
      const last = pose(animation.sceneFrame(particleScene, effect.duration - .001, false).effect0Motion)
      const next = pose(animation.sceneFrame(particleScene, effect.duration, false).effect0Motion)
      assert.deepEqual(next, first, `${name} ${effect.src} exact repeat`)
      near(last.opacity, first.opacity, .002, `${name} ${effect.src} opacity loop boundary`)
      if (first.opacity > .002 || last.opacity > .002)
        for (const property of ['left', 'top', 'width', 'height'])
          near(last[property], first[property], .002, `${name} ${effect.src}.${property} visible loop boundary`)
    }
  }
})

test('tilt moves opposite eyes while attached effects follow translation without resizing', () => {
  const gaze = [[0, 9, 5, 4], [100, 9, 5, 4]]
  const effect = { x: 52, y: 43, size: 24, duration: 1000, frames: [[0, 1, 6, .5, -3], [100, 1, 6, .5, -3]] }
  const independent = animation.sceneFrame(fixture(gaze, [effect, { ...effect, x: 340 }]), 500)
  const attached = animation.sceneFrame(fixture(gaze, [{ ...effect, followGaze: true }, { ...effect, x: 340, followGaze: true }]), 500)
  for (const side of ['left', 'right']) {
    const expected = [...BOXES[side + 'Eye']]
    expected[0] += 9
    expected[1] += 5 + (side === 'left' ? -4 : 4)
    assert.deepEqual(box(attached[side + 'EyeStyle']), expected)
  }
  const a = pose(independent.effect0Motion), b = pose(attached.effect0Motion)
  assert.deepEqual([a.left, a.top, a.width, a.height, a.opacity], [49, 49, 24, 24, .5])
  assert.deepEqual([b.left - a.left, b.top - a.top, b.width, b.height, b.opacity], [9, 1, 24, 24, .5])
  const c = pose(independent.effect1Motion), d = pose(attached.effect1Motion)
  assert.deepEqual([d.left - c.left, d.top - c.top, d.width, d.height, d.opacity], [9, 9, 24, 24, .5])
  for (const scene of Object.values(scenes)) for (const effect of scene.motion.effects) {
    for (const frame of effect.frames) assert.equal(frame[1], 1, `${effect.src} has fixed-size animation`)
  }
})

test('changing particle counts or returning to open eyes clears every unused native layer', () => {
  const effect = { x: 52, y: 43, size: 24, duration: 1000, frames: [[0, 1, 0, 1, 0], [100, 1, 0, 1, 0]] }
  for (const flipped of [false, true]) {
    const populated = animation.sceneFrame(fixture(still, [effect, effect, effect]), 500, flipped)
    for (let index = 0; index < 3; index++) assert.equal(pose(populated['effect' + index + 'Motion']).opacity, 1)
    for (const effects of [[effect], []]) {
      const cleared = animation.sceneFrame(fixture(still, effects), 0, flipped)
      for (let index = effects.length; index < 3; index++) {
        const p = pose(cleared['effect' + index + 'Motion'])
        assert.equal(p.opacity, 0)
        assert.ok(p.width > 0 && p.height > 0)
      }
      for (const side of ['left', 'right']) for (const lid of ['Top', 'Bottom'])
        assert.equal(pose(cleared[side + lid]).opacity, 0)
    }
  }
})

test('motion scheduler sleeps through static holds and wakes before the next movement', () => {
  const scene = fixture([[0, 0, 0, 0], [20, 0, 0, 0], [40, 10, 0, 0], [60, 10, 0, 0], [80, 0, 0, 0], [100, 0, 0, 0]])
  for (const [elapsed, boundary] of [[0, 200], [50, 200], [450, 600], [850, 1200]]) {
    const delay = animation.nextMotionDelay(scene, elapsed)
    assert.ok(delay > animation.FRAME_MS, `static hold at ${elapsed} sleeps`)
    assert.ok(elapsed + delay <= boundary, `static hold at ${elapsed} cannot skip ${boundary}`)
  }
  for (const elapsed of [199, 200, 250, 601, 799]) {
    const delay = animation.nextMotionDelay(scene, elapsed)
    assert.ok(delay > 0 && delay <= Math.ceil(animation.FRAME_MS), `active or imminent at ${elapsed}`)
  }
  const constantDelay = animation.nextMotionDelay(fixture(), 0)
  assert.ok(constantDelay > animation.FRAME_MS && constantDelay <= 1000)
  for (const elapsed of [0, 1000, 73219.25, 1000000]) {
    const delay = animation.nextMotionDelay(scene, elapsed)
    assert.ok(Number.isFinite(delay) && delay > 0 && delay <= 1000, `bounded future wake at ${elapsed}`)
  }
})

test('the earliest independent particle animation also wakes a resting face', () => {
  const effect = { x: 52, y: 43, size: 24, duration: 500,
    frames: [[0, 1, 0, 0, 0], [20, 1, 0, 0, 0], [40, 1, 0, 1, 0], [60, 1, 0, 0, 0], [100, 1, 0, 0, 0]] }
  const scene = fixture(still, [effect])
  const delay = animation.nextMotionDelay(scene, 0)
  assert.ok(delay > animation.FRAME_MS && delay <= 100)
  const active = animation.nextMotionDelay(scene, 120)
  assert.ok(active > 0 && active <= Math.ceil(animation.FRAME_MS))
  const nextCycle = animation.nextMotionDelay(scene, 450)
  assert.ok(nextCycle > animation.FRAME_MS && nextCycle <= 150)
})
