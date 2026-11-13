export const CAROUSEL_SETTING_KEY = 'desk.auto-carousel.enabled.v1'

// Default on. A late cache read must never overwrite a newer user choice;
// serialize writes so quick successive taps persist the final choice.
export default function createCarouselSetting(storage, onChange) {
  let enabled = true, revision = 0, disposed = false, writing = false, queued = null
  const flush = () => {
    if (writing || queued === null) return
    const value = queued
    queued = null; writing = true
    const done = () => { writing = false; flush() }
    const failed = () => { console.warn('[desk] carousel preference save failed'); done() }
    try { storage.set({ key: CAROUSEL_SETTING_KEY, value, success: done, fail: failed }) }
    catch (error) { failed() }
  }
  return {
    load() {
      const requested = revision
      try {
        storage.get({
          key: CAROUSEL_SETTING_KEY, default: 'true',
          success: value => {
            if (disposed || revision !== requested) return
            const data = value && typeof value === 'object' ? value.data : value
            enabled = data !== 'false'
            onChange(enabled)
          },
          fail: () => console.warn('[desk] carousel preference unavailable')
        })
      } catch (error) { console.warn('[desk] carousel preference unavailable') }
    },
    toggle() {
      if (disposed) return
      revision += 1; enabled = !enabled
      onChange(enabled)
      queued = String(enabled); flush()
    },
    dispose() { disposed = true }
  }
}
