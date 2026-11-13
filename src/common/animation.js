import { BOXES, physicalRect } from './layout'
// Active-motion update budget, not a measured display FPS.
export const TARGET_FPS = 60
export const FRAME_MS = 1000 / TARGET_FPS
export const CARD_OUT_MS = 160
export const CARD_DURATION_MS = 420
export const CARD_REST = 'left:0px;top:0px;opacity:1;'
// Compensate work time; delayed callbacks skip ahead, never queue catch-up frames.
export function nextFrameDelay(elapsed) {
  return Math.max(1, Math.ceil((Math.floor(elapsed / FRAME_MS) + 1) * FRAME_MS - elapsed))
}
// Resting holds have no visual work. Wake at the first changing segment instead
// of sampling the same pose 60 times a second. Still keep one bounded timer.
function trackDelay(frames, elapsed, duration) {
  const phase = (Math.max(0, elapsed) % duration) / duration * 100
  let wait = duration
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i]
    if (!a.slice(1).some((v, n) => v !== b[n + 1])) continue
    if (phase >= a[0] && phase < b[0]) return 0
    const distance = a[0] >= phase ? a[0] - phase : 100 - phase + a[0]
    wait = Math.min(wait, distance / 100 * duration)
  }
  return wait
}
export function nextMotionDelay(scene, elapsed) {
  let wait = 1000
  for (const key of ['left', 'right', 'gaze']) {
    if (scene.motion[key]) wait = Math.min(wait, trackDelay(scene.motion[key], elapsed, scene.duration))
  }
  for (const effect of scene.motion.effects) wait = Math.min(wait, trackDelay(effect.frames, elapsed, effect.duration))
  return wait === 0 ? nextFrameDelay(elapsed) : Math.max(1, Math.ceil(wait))
}
export function sample(frames, elapsed, duration) {
  const p = (Math.max(0, elapsed) % duration) / duration * 100
  let a = frames[0], b = frames[frames.length - 1]
  for (let i = 1; i < frames.length; i++) if (p <= frames[i][0]) { a = frames[i - 1]; b = frames[i]; break }
  let t = (p - a[0]) / Math.max(0.001, b[0] - a[0])
  t = t * t * (3 - 2 * t)
  return a.slice(1).map((v, i) => v + (b[i + 1] - v) * t)
}
const round = n => Math.round(n * 1000) / 1000
function rect(x,y,w,h,opacity) {
  return 'left:'+round(x)+'px;top:'+round(y)+'px;width:'+round(w)+'px;height:'+round(h)+'px;opacity:'+round(opacity)+';'
}
export function sceneFrame(scene, elapsed, flipped) {
  const result = {}
  const gaze=sample(scene.motion.gaze||[[0,0,0],[100,0,0]],elapsed,scene.duration)
  for(const side of ['left','right']){
    // Tilt is a small height difference between the eyes, never a native rotate.
    const tilt=(gaze[2]||0)*(side==='left'?-1:1)
    const base=BOXES[side+'Eye'],box=[base[0]+Math.round(gaze[0]),base[1]+Math.round(gaze[1]+tilt),base[2],base[3]]
    const mapped=typeof flipped==='boolean'?physicalRect(box,flipped):box
    result[side+'EyeStyle']=rect(mapped[0],mapped[1],mapped[2],mapped[3],1)
  }
  // Opaque, fixed 128px eye images; only black eyelids change. No resized/rotated eye layer.
  for (const side of ['left','right']) {
    const p = sample(scene.motion[side], elapsed, scene.duration)
    const top = Math.max(0, Math.min(128, p[0])), bottom = Math.max(0, Math.min(128, p[1]))
    const upper=[0,0,128,top], lower=[0,128-bottom,128,bottom]
    const lidStyle=(box, lowerLid)=>{
      if(typeof flipped!=='boolean')return rect(box[0],box[1],box[2],box[3],1)
      // No zero-sized native masks; an open lid is explicitly transparent.
      const visible=box[3]>0.5
      if(!visible)return rect(0,0,1,128,0)
      const pixels=Math.max(1,Math.round(box[3]))
      const logical=[0,lowerLid?128-pixels:0,128,pixels]
      const mapped=physicalRect(logical,flipped,128,128)
      return rect(mapped[0],mapped[1],mapped[2],mapped[3],visible?1:0)
    }
    result[side+'Top'] = lidStyle(upper)
    result[side+'Bottom'] = lidStyle(lower,true)
  }
  for (let i=0;i<3;i++) {
    const e=scene.motion.effects[i]
    // Explicit invisible pose also clears a previous effect when a mood has fewer particles.
    if (!e) { result['effect'+i+'Motion']=rect(0,0,2,2,0); continue }
    const p=sample(e.frames,elapsed,e.duration), size=e.size*p[0]
    const dx=e.followGaze?gaze[0]:0
    // Attached accents stay with their eye when the face tilts.
    const dy=e.followGaze?gaze[1]+(gaze[2]||0)*(e.x+e.size/2<245?-1:1):0
    let box=[e.x+(e.size-size)/2+(p[3]||0)+dx,e.y+(e.size-size)/2+p[1]+dy,size,size]
    if(typeof flipped==='boolean')box=physicalRect(box.map(Math.round),flipped)
    result['effect'+i+'Motion']=rect(box[0],box[1],box[2],box[3],p[2])
  }
  return result
}
export function cardFrame(direction, elapsed, flipped) {
  if (elapsed >= CARD_DURATION_MS) return CARD_REST
  const outgoing = elapsed < CARD_OUT_MS
  let t = Math.min(1, Math.max(0, outgoing ? elapsed / CARD_OUT_MS : (elapsed - CARD_OUT_MS) / (CARD_DURATION_MS - CARD_OUT_MS)))
  t = outgoing ? t * t : 1 - (1 - t) * (1 - t)
  const offset = outgoing ? -t : 1 - t
  const x = direction === 'left' ? 110 : direction === 'right' ? -110 : 0
  const y = direction === 'up' ? 65 : direction === 'down' ? -65 : 0
  let dx=x*offset,dy=y*offset
  if(typeof flipped==='boolean') { const oldX=dx;dx=flipped?dy:-dy;dy=flipped?-oldX:oldX;dx=Math.round(dx);dy=Math.round(dy) }
  return 'left:' + round(dx) + 'px;top:' + round(dy) + 'px;opacity:' + round(outgoing ? 1 - t : t) + ';'
}

// Two fully opaque adjacent cards. Only physical position changes per frame.
export function slideSpec(direction) {
  const horizontal=direction==='left'||direction==='right'
  return {horizontal,extent:horizontal?490:192,sign:direction==='left'||direction==='up'?-1:1}
}
export function slideStyle(direction, offset, flipped) {
  const spec=slideSpec(direction)
  let x=spec.horizontal?offset:0,y=spec.horizontal?0:offset
  if(typeof flipped==='boolean'){const dx=x;x=flipped?y:-y;y=flipped?-dx:dx}
  return 'left:'+Math.round(x)+'px;top:'+Math.round(y)+'px;opacity:1;'
}
export function slidePair(direction, distance, flipped) {
  const spec=slideSpec(direction),offset=spec.sign*Math.max(0,Math.min(spec.extent,distance))
  return {front:slideStyle(direction,offset,flipped),back:slideStyle(direction,offset-spec.sign*spec.extent,flipped)}
}
export function dragDestination(view, home, direction) {
  if(direction==='up')return view==='menu'?'': 'menu'
  if(direction==='down')return view===home?'':home
  const modes=['eyes','clock','calendar','codex'],index=modes.indexOf(view)
  return index<0?'':modes[(index+(direction==='left'?1:3))%4]
}
export function shouldCommit(distance, velocity, extent) {
  return distance>=extent*.18 || (distance>=24 && velocity>=.4)
}
