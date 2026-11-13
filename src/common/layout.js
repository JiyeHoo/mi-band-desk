// Logical landscape rectangles; display and physical input share this source.
// No blanket centre-safe rectangle: every screen uses the full capsule.
export const BOXES = {
  eyes: [0, 0, 490, 192], heading: [40, 16, 410, 38], clock: [24, 57, 442, 114],
  confirmText: [100, 67, 290, 58],
  keep: [35, 32, 132, 128], carousel: [179, 32, 132, 128], exit: [323, 32, 132, 128],
  keepValue: [45, 102, 112, 40], carouselValue: [189, 102, 112, 40],
  cancel: [0, 0, 92, 192], confirm: [398, 0, 92, 192],
  leftEye: [101, 32, 128, 128], rightEye: [261, 32, 128, 128],
  codexRing: [25, 12, 168, 168], codexWindow: [47, 113, 124, 30],
  codexLogo: [217, 35, 36, 36], codexPlan: [263, 34, 196, 38],
  codexReset: [217, 87, 242, 38], codexFresh: [217, 130, 210, 32],
  codexLoading: [427, 131, 26, 26]
}
for (let day = 0; day < 7; day++) {
  BOXES['day' + day] = [22 + day * 64, 44, 62, 124]
  BOXES['day' + day + 'Mark'] = [27 + day * 64, 82, 52, 53]
}
export const INPUTS = ['eyes', 'keep', 'carousel', 'exit', 'cancel', 'confirm']
export function rectStyle(rect) {
  return 'left:' + rect[0] + 'px;top:' + rect[1] + 'px;width:' + rect[2] + 'px;height:' + rect[3] + 'px;'
}
export function physicalRect(rect, flipped, canvasWidth = 490, canvasHeight = 192) {
  const [x, y, width, height] = rect
  return flipped ? [y, canvasWidth - x - width, height, width] : [canvasHeight - y - height, x, height, width]
}
export function layoutStyles(flipped) {
  const result = {}
  Object.keys(BOXES).forEach((key) => {
    result[key + 'Style'] = rectStyle(physicalRect(BOXES[key], flipped))
    if (INPUTS.indexOf(key) !== -1) result[key + 'Hit'] = rectStyle(physicalRect(BOXES[key], flipped))
  })
  return result
}
export function landscapeSwipe(direction, flipped) {
  const forward = { right: 'up', left: 'down', up: 'left', down: 'right' }
  const reverse = { left: 'up', right: 'down', down: 'left', up: 'right' }
  return (flipped ? reverse : forward)[direction]
}

export function landscapeDelta(dx, dy, flipped) {
  return flipped ? [-dy,dx] : [dy,-dx]
}
