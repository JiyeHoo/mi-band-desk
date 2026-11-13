// An API acknowledgement does not prove physical screen behaviour.
export default function createKeepScreen(api, onChange, now) {
  const timestamp = now || Date.now
  let visible = false
  let deadline = 0
  let revision = 0
  let state = 'off'
  let error = ''
  function publish() { onChange({ state, error, deadline }) }
  function desired() { return visible && deadline > timestamp() }
  function request() {
    const keep = desired()
    const current = ++revision
    state = keep ? 'pending' : 'off'
    error = ''
    publish()
    try {
      api.setKeepScreenOn({
        keepScreenOn: keep,
        success() {
          if (current !== revision) {
            // A late enable acknowledgement must not outlive hide/exit/expiry.
            if (keep && !desired()) request()
            return
          }
          state = keep ? 'on' : 'off'
          publish()
        },
        fail(data, code) {
          if (current !== revision) return
          state = 'error'
          error = String(code === undefined ? '未知' : code)
          publish()
          console.warn('[desk] keepScreenOn failed: ' + error)
        }
      })
    } catch (exception) {
      if (current !== revision) return
      state = 'error'
      error = '不可用'
      publish()
      console.warn('[desk] keepScreenOn unavailable')
    }
  }
  return {
    show() {
      visible = true
      if (deadline <= timestamp()) deadline = 0
      request()
    },
    hide() { visible = false; request() },
    select(minutes) {
      deadline = minutes > 0 ? timestamp() + minutes * 60000 : 0
      request()
    },
    tick() {
      if (deadline && timestamp() >= deadline) { deadline = 0; request() }
    },
    dispose() { visible = false; deadline = 0; request() }
  }
}
