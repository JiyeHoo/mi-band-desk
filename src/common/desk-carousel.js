export const DESK_DWELL_MS = [60000, 10000, 10000, 10000]
export const DESK_MANUAL_PAUSE_MS = 30000
const GESTURE_LIMIT_MS = 120000
const NATIVE_ACK_MS = 2000

// The existing one-second foreground ticker asks when to advance. Native
// swiper events, not this controller, confirm which page is actually visible.
export default function createDeskCarousel(now) {
  let enabled = true, active = false, index = -1, due = 0, holdUntil = 0, touchUntil = 0
  let pending = -1, pendingUntil = 0
  const dwell = () => DESK_DWELL_MS[index] || DESK_DWELL_MS[0]
  const reset = () => { due = Math.max(now() + dwell(), holdUntil) }
  const input = held => {
    pending = -1
    touchUntil = held ? now() + GESTURE_LIMIT_MS : 0
    holdUntil = now() + DESK_MANUAL_PAUSE_MS
    reset()
  }
  return {
    setEnabled(value) { enabled = value; pending = -1; reset() },
    show(value) {
      active = true; index = value; holdUntil = 0; touchUntil = 0; pending = -1; reset()
    },
    stop() { active = false; pending = -1; due = 0; touchUntil = 0 },
    select(value) {
      if (value === index) return
      const automatic = value === pending
      index = value
      if (value < 0) { pending = -1; touchUntil = 0 }
      if (!automatic) holdUntil = now() + DESK_MANUAL_PAUSE_MS
      reset()
    },
    input,
    nativeStart() { if (pending < 0) input(true) },
    nativeEnd() {
      if (pending >= 0) { pending = -1; touchUntil = 0 }
      else input(false)
    },
    rejected() { pending = -1; reset() },
    next(blocked) {
      const time = now()
      if (!enabled || !active || index < 0) return null
      if (pending >= 0) {
        if (time < pendingUntil) return null
        const accepted = index === pending
        pending = -1
        if (!accepted) reset()
      }
      // A real release/cancel clears this immediately. Missing events recover
      // after a bounded two-minute hold rather than disabling rotation forever.
      if (touchUntil) {
        if (time < touchUntil) return null
        touchUntil = 0; reset()
      }
      if (blocked || time < due || time < holdUntil) return null
      pending = (index + 1) % DESK_DWELL_MS.length
      pendingUntil = time + NATIVE_ACK_MS
      return pending
    }
  }
}
