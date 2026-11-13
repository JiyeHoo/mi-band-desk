// Logical landscape rectangles; display and physical input share this source.
// No blanket centre-safe rectangle: every screen uses the full capsule.
const BOXES = {
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
const INPUTS = ['eyes', 'keep', 'carousel', 'exit', 'cancel', 'confirm']
function rectStyle(rect) {
  return 'left:' + rect[0] + 'px;top:' + rect[1] + 'px;width:' + rect[2] + 'px;height:' + rect[3] + 'px;'
}
function physicalRect(rect, flipped, canvasWidth = 490, canvasHeight = 192) {
  const [x, y, width, height] = rect
  return flipped ? [y, canvasWidth - x - width, height, width] : [canvasHeight - y - height, x, height, width]
}
function layoutStyles(flipped) {
  const result = {}
  Object.keys(BOXES).forEach((key) => {
    result[key + 'Style'] = rectStyle(physicalRect(BOXES[key], flipped))
    if (INPUTS.indexOf(key) !== -1) result[key + 'Hit'] = rectStyle(physicalRect(BOXES[key], flipped))
  })
  return result
}
function landscapeSwipe(direction, flipped) {
  const forward = { right: 'up', left: 'down', up: 'left', down: 'right' }
  const reverse = { left: 'up', right: 'down', down: 'left', up: 'right' }
  return (flipped ? reverse : forward)[direction]
}

function landscapeDelta(dx, dy, flipped) {
  return flipped ? [-dy,dx] : [dy,-dx]
}

// Mainland China schedule, State Council notice 国办发明电〔2025〕7号.
// https://www.gov.cn/zhengce/content/202511/content_7047090.htm
// Never infer compensatory work/rest days for a year we have not verified.
const HOLIDAY_YEAR = 2026
const breaks = [[101,103],[215,223],[404,406],[501,505],[619,621],[925,927],[1001,1007]]
const workdays = [104,214,228,509,920,1010]
const festivals2026 = {101:'元旦',216:'除夕',217:'春节',405:'清明',501:'劳动',619:'端午',925:'中秋',1001:'国庆'}
const fixedFestivals = {101:'元旦',501:'劳动',1001:'国庆'}
function holidayFor(date) {
  const code=(date.getMonth()+1)*100+date.getDate(),known=date.getFullYear()===HOLIDAY_YEAR
  return { festival:(known?festivals2026:fixedFestivals)[code]||'',
    mark:!known?'':workdays.indexOf(code)!==-1?'班':breaks.some(range=>code>=range[0]&&code<=range[1])?'休':'',known }
}


function pad2(value) {
  return value < 10 ? '0' + value : '' + value
}

function clockText(date) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return {
    time: pad2(date.getHours()) + ':' + pad2(date.getMinutes()),
    seconds: pad2(date.getSeconds()),
    date: (date.getMonth() + 1) + '月' + date.getDate() + '日  周' + weekdays[date.getDay()]
  }
}

function durationText(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return pad2(Math.floor(seconds / 3600)) + ':' + pad2(Math.floor(seconds / 60) % 60) + ':' + pad2(seconds % 60)
}

function pixelOffset(milliseconds) {
  const positions = [[0, 0], [2, 0], [2, 2], [0, 2], [-2, 2], [-2, 0], [-2, -2], [0, -2]]
  return positions[Math.floor(Math.max(0, milliseconds) / 60000) % positions.length]
}

// Local calendar arithmetic (not fixed milliseconds) handles month/year and DST boundaries.
function weekText(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (date.getDay() + 6) % 7)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    days.push({ ...holidayFor(d), label: '一二三四五六日'[i], date: '' + d.getDate(), today: d.toDateString() === date.toDateString() })
  }
  return { range: (start.getMonth() + 1) + '月' + start.getDate() + '日 — ' + (end.getMonth() + 1) + '月' + end.getDate() + '日',
    today: '今天 ' + (date.getMonth() + 1) + '月' + date.getDate() + '日', days }
}


// Active-motion update budget, not a measured display FPS.
const TARGET_FPS = 60
const FRAME_MS = 1000 / TARGET_FPS
const CARD_OUT_MS = 160
const CARD_DURATION_MS = 420
const CARD_REST = 'left:0px;top:0px;opacity:1;'
// Compensate work time; delayed callbacks skip ahead, never queue catch-up frames.
function nextFrameDelay(elapsed) {
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
function nextMotionDelay(scene, elapsed) {
  let wait = 1000
  for (const key of ['left', 'right', 'gaze']) {
    if (scene.motion[key]) wait = Math.min(wait, trackDelay(scene.motion[key], elapsed, scene.duration))
  }
  for (const effect of scene.motion.effects) wait = Math.min(wait, trackDelay(effect.frames, elapsed, effect.duration))
  return wait === 0 ? nextFrameDelay(elapsed) : Math.max(1, Math.ceil(wait))
}
function sample(frames, elapsed, duration) {
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
function sceneFrame(scene, elapsed, flipped) {
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
function cardFrame(direction, elapsed, flipped) {
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
function slideSpec(direction) {
  const horizontal=direction==='left'||direction==='right'
  return {horizontal,extent:horizontal?490:192,sign:direction==='left'||direction==='up'?-1:1}
}
function slideStyle(direction, offset, flipped) {
  const spec=slideSpec(direction)
  let x=spec.horizontal?offset:0,y=spec.horizontal?0:offset
  if(typeof flipped==='boolean'){const dx=x;x=flipped?y:-y;y=flipped?-dx:dx}
  return 'left:'+Math.round(x)+'px;top:'+Math.round(y)+'px;opacity:1;'
}
function slidePair(direction, distance, flipped) {
  const spec=slideSpec(direction),offset=spec.sign*Math.max(0,Math.min(spec.extent,distance))
  return {front:slideStyle(direction,offset,flipped),back:slideStyle(direction,offset-spec.sign*spec.extent,flipped)}
}
function dragDestination(view, home, direction) {
  if(direction==='up')return view==='menu'?'': 'menu'
  if(direction==='down')return view===home?'':home
  const modes=['eyes','clock','calendar','codex'],index=modes.indexOf(view)
  return index<0?'':modes[(index+(direction==='left'?1:3))%4]
}
function shouldCommit(distance, velocity, extent) {
  return distance>=extent*.18 || (distance>=24 && velocity>=.4)
}

// Generated by npm run robot:assets
const ROBOT_SCENES = {"idle":{"label":"自然环顾","duration":5600,"left":"/common/robot/open.png","right":"/common/robot/open.png","effects":[],"motion":{"left":[[0,0,0],[63,0,0],[66,64,64],[70,0,0],[100,0,0]],"right":[[0,0,0],[63,0,0],[66,64,64],[70,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,0,0,0],[24,9,-2,1],[34,9,-2,1],[46,0,0,0],[56,-6,1,-2],[66,-6,1,-2],[76,0,0,0],[100,0,0,0]],"effects":[]}},"blink":{"label":"机灵连眨","duration":4000,"left":"/common/robot/open.png","right":"/common/robot/open.png","effects":[],"motion":{"left":[[0,0,0],[16,0,0],[19,64,64],[22,0,0],[26,0,0],[29,64,64],[32,0,0],[100,0,0]],"right":[[0,0,0],[16,0,0],[19,64,64],[22,0,0],[26,0,0],[29,64,64],[32,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,0,0,0],[19,0,6,1],[24,0,0,0],[29,0,5,-1],[36,0,0,0],[100,0,0,0]],"effects":[]}},"look":{"label":"专注追光","duration":5200,"left":"/common/robot/open.png","right":"/common/robot/open.png","effects":[],"motion":{"left":[[0,0,0],[12,12,0],[64,12,0],[68,64,64],[72,0,0],[100,0,0]],"right":[[0,0,0],[12,12,0],[64,12,0],[68,64,64],[72,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,0,0,0],[24,-13,-2,-2],[36,-13,-2,-2],[52,13,-2,2],[64,13,-2,2],[78,0,0,0],[100,0,0,0]],"effects":[]}},"happy":{"label":"开心蹦蹦","duration":4400,"left":"/common/robot/smile.png","right":"/common/robot/smile.png","effects":["/common/robot/spark.png","/common/robot/spark.png"],"motion":{"left":[[0,0,0],[20,0,0],[24,64,64],[28,0,0],[40,0,0],[44,64,64],[48,0,0],[100,0,0]],"right":[[0,0,0],[20,0,0],[24,64,64],[28,0,0],[40,0,0],[44,64,64],[48,0,0],[100,0,0]],"gaze":[[0,0,0,0],[10,0,0,0],[19,0,-10,-3],[28,0,2,1],[39,0,-8,3],[49,0,0,0],[100,0,0,0]],"effects":[{"src":"spark","x":54,"y":76,"size":32,"motion":"happySpark","duration":4400,"followGaze":false,"frames":[[0,1,0,0,0],[10,1,0,0,0],[20,1,-5,1,0],[31,1,-7,0,0],[43,1,-4,0.9,0],[56,1,-7,0,0],[72,1,0,0,0],[100,1,0,0,0]]},{"src":"spark","x":407,"y":79,"size":32,"motion":"happySparkLate","duration":4400,"followGaze":false,"frames":[[0,1,0,0,0],[20,1,0,0,0],[30,1,-4,1,0],[42,1,-7,0,0],[50,1,-3,0.9,0],[63,1,-6,0,0],[76,1,0,0,0],[100,1,0,0,0]]}]}},"curious":{"label":"歪头打量","duration":5200,"left":"/common/robot/open.png","right":"/common/robot/open.png","effects":[],"motion":{"left":[[0,0,0],[14,0,0],[27,30,0],[43,30,0],[57,8,0],[69,8,0],[77,0,0],[100,0,0]],"right":[[0,0,0],[62,0,0],[66,64,64],[70,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,0,0,0],[27,8,-3,7],[43,8,-3,7],[57,-4,1,-4],[65,-4,1,-4],[78,0,0,0],[100,0,0,0]],"effects":[]}},"surprise":{"label":"吓了一跳","duration":4600,"left":"/common/robot/open.png","right":"/common/robot/open.png","effects":["/common/robot/spark.png","/common/robot/spark.png"],"motion":{"left":[[0,24,8],[7,30,10],[14,0,0],[47,0,0],[51,64,64],[56,0,0],[80,0,0],[90,24,8],[100,24,8]],"right":[[0,24,8],[7,30,10],[14,0,0],[47,0,0],[51,64,64],[56,0,0],[80,0,0],[90,24,8],[100,24,8]],"gaze":[[0,0,0,0],[8,0,5,0],[16,0,-11,0],[24,0,3,-2],[34,0,-2,1],[45,0,0,0],[100,0,0,0]],"effects":[{"src":"spark","x":51,"y":71,"size":36,"motion":"startle","duration":4600,"followGaze":false,"frames":[[0,1,3,0,0],[9,1,3,0,0],[17,1,-5,1,0],[29,1,-7,0.8,0],[44,1,-8,0,0],[65,1,3,0,0],[100,1,3,0,0]]},{"src":"spark","x":406,"y":71,"size":36,"motion":"startle","duration":4600,"followGaze":false,"frames":[[0,1,3,0,0],[9,1,3,0,0],[17,1,-5,1,0],[29,1,-7,0.8,0],[44,1,-8,0,0],[65,1,3,0,0],[100,1,3,0,0]]}]}},"sleepy":{"label":"困到点头","duration":6400,"left":"/common/robot/open.png","right":"/common/robot/open.png","effects":[],"motion":{"left":[[0,36,0],[12,36,0],[28,48,0],[38,66,62],[43,66,62],[48,8,0],[58,36,0],[100,36,0]],"right":[[0,36,0],[12,36,0],[28,48,0],[38,66,62],[43,66,62],[48,8,0],[58,36,0],[100,36,0]],"gaze":[[0,0,0,0],[12,0,0,0],[27,1,7,2],[39,2,12,5],[48,0,-4,-2],[58,0,0,0],[100,0,0,0]],"effects":[]}},"wink":{"label":"俏皮歪头","duration":4400,"left":"/common/robot/open.png","right":"/common/robot/open.png","effects":["/common/robot/heart.png"],"motion":{"left":[[0,0,0],[20,0,0],[26,64,64],[38,64,64],[44,0,0],[100,0,0]],"right":[[0,0,0],[63,0,0],[66,64,64],[70,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,0,0,0],[25,-6,-2,-6],[40,-6,-2,-6],[53,2,0,2],[64,0,0,0],[100,0,0,0]],"effects":[{"src":"heart","x":407,"y":72,"size":35,"motion":"winkHeart","duration":4400,"followGaze":false,"frames":[[0,1,6,0,0],[19,1,6,0,0],[29,1,0,1,0],[44,1,-4,1,0],[61,1,-11,0,0],[78,1,6,0,0],[100,1,6,0,0]]}]}},"love":{"label":"心动摇摇","duration":5000,"left":"/common/robot/smile.png","right":"/common/robot/smile.png","effects":["/common/robot/heart.png","/common/robot/heart.png","/common/robot/heart.png"],"motion":{"left":[[0,0,0],[20,0,0],[24,64,64],[28,0,0],[40,0,0],[44,64,64],[48,0,0],[100,0,0]],"right":[[0,0,0],[20,0,0],[24,64,64],[28,0,0],[40,0,0],[44,64,64],[48,0,0],[100,0,0]],"gaze":[[0,0,0,0],[10,0,0,0],[23,-10,1,-5],[38,10,1,5],[51,-7,0,-3],[65,0,0,0],[100,0,0,0]],"effects":[{"src":"heart","x":53,"y":79,"size":35,"motion":"loveHeart","duration":5000,"followGaze":false,"frames":[[0,1,4,0,0],[11,1,4,0,0],[24,1,-2,1,0],[39,1,-7,0.75,0],[51,1,-2,1,0],[69,1,-12,0,0],[85,1,4,0,0],[100,1,4,0,0]]},{"src":"heart","x":231,"y":135,"size":28,"motion":"loveHeartLate","duration":5000,"followGaze":false,"frames":[[0,1,3,0,0],[23,1,3,0,0],[35,1,-3,1,0],[51,1,-8,1,0],[69,1,-12,0,0],[85,1,3,0,0],[100,1,3,0,0]]},{"src":"heart","x":402,"y":79,"size":35,"motion":"loveHeart","duration":5000,"followGaze":false,"frames":[[0,1,4,0,0],[11,1,4,0,0],[24,1,-2,1,0],[39,1,-7,0.75,0],[51,1,-2,1,0],[69,1,-12,0,0],[85,1,4,0,0],[100,1,4,0,0]]}]}},"cry":{"label":"委屈抽泣","duration":4800,"left":"/common/robot/sad.png","right":"/common/robot/sad.png","effects":["/common/robot/tear.png","/common/robot/tear.png"],"motion":{"left":[[0,0,0],[100,0,0]],"right":[[0,0,0],[100,0,0]],"gaze":[[0,0,0,0],[10,0,0,0],[20,0,6,-2],[27,0,-3,-1],[35,0,5,2],[42,0,-2,1],[51,0,5,-1],[62,0,0,0],[100,0,0,0]],"effects":[{"src":"tear","x":137,"y":123,"size":25,"motion":"rain","duration":2000,"followGaze":true,"frames":[[0,1,-3,0,0],[10,1,0,0.9,0],[56,1,20,0.9,0],[67,1,23,0,0],[80,1,-3,0,0],[100,1,-3,0,0]]},{"src":"tear","x":328,"y":123,"size":25,"motion":"rainLate","duration":2000,"followGaze":true,"frames":[[0,1,-3,0,0],[31,1,-3,0,0],[41,1,0,0.9,0],[80,1,20,0.9,0],[89,1,23,0,0],[98,1,-3,0,0],[100,1,-3,0,0]]}]}},"blush":{"label":"害羞躲躲","duration":5600,"left":"/common/robot/smile.png","right":"/common/robot/smile.png","effects":["/common/robot/blush.png","/common/robot/blush.png"],"motion":{"left":[[0,0,0],[25,0,0],[29,64,64],[34,0,0],[58,0,0],[62,64,64],[66,0,0],[100,0,0]],"right":[[0,0,0],[25,0,0],[29,64,64],[34,0,0],[58,0,0],[62,64,64],[66,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,0,0,0],[26,-11,6,-5],[41,-11,6,-5],[53,-3,2,-2],[64,-9,5,-4],[79,0,0,0],[100,0,0,0]],"effects":[{"src":"blush","x":142,"y":138,"size":40,"motion":"cheek","duration":5600,"followGaze":true,"frames":[[0,1,0,0.25,0],[12,1,0,0.25,0],[27,1,0,1,0],[65,1,0,1,0],[82,1,0,0.25,0],[100,1,0,0.25,0]]},{"src":"blush","x":302,"y":138,"size":40,"motion":"cheek","duration":5600,"followGaze":true,"frames":[[0,1,0,0.25,0],[12,1,0,0.25,0],[27,1,0,1,0],[65,1,0,1,0],[82,1,0,0.25,0],[100,1,0,0.25,0]]}]}},"stars":{"label":"星眼雀跃","duration":4400,"left":"/common/robot/star-eye.png","right":"/common/robot/star-eye.png","effects":["/common/robot/spark.png","/common/robot/spark.png","/common/robot/spark.png"],"motion":{"left":[[0,0,0],[63,0,0],[66,64,64],[70,0,0],[100,0,0]],"right":[[0,0,0],[63,0,0],[66,64,64],[70,0,0],[100,0,0]],"gaze":[[0,0,0,0],[8,0,0,0],[18,-3,-8,-4],[28,0,2,2],[40,3,-11,4],[53,0,0,0],[100,0,0,0]],"effects":[{"src":"spark","x":54,"y":79,"size":32,"motion":"happySpark","duration":4400,"followGaze":false,"frames":[[0,1,0,0,0],[10,1,0,0,0],[20,1,-5,1,0],[31,1,-7,0,0],[43,1,-4,0.9,0],[56,1,-7,0,0],[72,1,0,0,0],[100,1,0,0,0]]},{"src":"spark","x":405,"y":79,"size":32,"motion":"happySparkLate","duration":4400,"followGaze":false,"frames":[[0,1,0,0,0],[20,1,0,0,0],[30,1,-4,1,0],[42,1,-7,0,0],[50,1,-3,0.9,0],[63,1,-6,0,0],[76,1,0,0,0],[100,1,0,0,0]]},{"src":"spark","x":233,"y":11,"size":24,"motion":"crownSpark","duration":4400,"followGaze":false,"frames":[[0,1,2,0,0],[30,1,2,0,0],[41,1,-2,1,0],[58,1,-3,0,0],[75,1,2,0,0],[100,1,2,0,0]]}]}},"angry":{"label":"气鼓摇头","duration":4400,"left":"/common/robot/angry.png","right":"/common/robot/angry-right.png","effects":["/common/robot/anger.png"],"motion":{"left":[[0,0,0],[64,0,0],[68,64,64],[73,0,0],[100,0,0]],"right":[[0,0,0],[64,0,0],[68,64,64],[73,0,0],[100,0,0]],"gaze":[[0,0,0,0],[10,0,3,0],[20,-11,3,-4],[29,11,3,4],[38,-8,3,-3],[47,8,3,3],[59,0,0,0],[100,0,0,0]],"effects":[{"src":"anger","x":410,"y":71,"size":34,"motion":"angerMark","duration":4400,"followGaze":false,"frames":[[0,1,0,0,0],[12,1,0,0,0],[21,1,-2,1,-2],[30,1,1,1,2],[39,1,-1,1,-2],[48,1,1,1,2],[61,1,-3,0,0],[78,1,0,0,0],[100,1,0,0,0]]}]}},"dizzy":{"label":"晕乎打转","duration":5200,"left":"/common/robot/spiral.png","right":"/common/robot/spiral.png","effects":["/common/robot/spark.png"],"motion":{"left":[[0,0,0],[40,0,0],[45,64,64],[51,0,0],[100,0,0]],"right":[[0,0,0],[55,0,0],[60,64,64],[67,0,0],[100,0,0]],"gaze":[[0,0,0,0],[9,0,0,0],[20,8,-5,5],[31,11,5,0],[42,-4,10,-5],[53,-11,1,0],[64,-3,-7,5],[78,0,0,0],[100,0,0,0]],"effects":[{"src":"spark","x":233,"y":9,"size":24,"motion":"dizzySpark","duration":5200,"followGaze":false,"frames":[[0,1,0,0,0],[12,1,0,0,0],[24,1,0,1,7],[40,1,2,0.7,0],[55,1,0,1,-7],[72,1,-2,0,0],[86,1,0,0,0],[100,1,0,0,0]]}]}},"uwu":{"label":"软萌蹭蹭","duration":5800,"left":"/common/robot/u-eye.png","right":"/common/robot/u-eye.png","effects":["/common/robot/blush.png","/common/robot/blush.png"],"motion":{"left":[[0,0,0],[63,0,0],[66,64,64],[70,0,0],[100,0,0]],"right":[[0,0,0],[63,0,0],[66,64,64],[70,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,0,0,0],[26,-10,4,-6],[36,-10,4,-6],[51,10,4,6],[61,10,4,6],[77,0,0,0],[100,0,0,0]],"effects":[{"src":"blush","x":141,"y":139,"size":42,"motion":"cheek","duration":5800,"followGaze":true,"frames":[[0,1,0,0.25,0],[12,1,0,0.25,0],[27,1,0,1,0],[65,1,0,1,0],[82,1,0,0.25,0],[100,1,0,0.25,0]]},{"src":"blush","x":301,"y":139,"size":42,"motion":"cheek","duration":5800,"followGaze":true,"frames":[[0,1,0,0.25,0],[12,1,0,0.25,0],[27,1,0,1,0],[65,1,0,1,0],[82,1,0,0.25,0],[100,1,0,0.25,0]]}]}},"owo":{"label":"圆眼探头","duration":5000,"left":"/common/robot/round-eye.png","right":"/common/robot/round-eye.png","effects":[],"motion":{"left":[[0,0,0],[76,0,0],[80,64,64],[85,0,0],[100,0,0]],"right":[[0,0,0],[76,0,0],[80,64,64],[85,0,0],[100,0,0]],"gaze":[[0,0,0,0],[10,0,0,0],[22,0,-10,0],[32,0,-10,0],[44,-9,-7,-5],[57,9,-7,5],[72,0,0,0],[100,0,0,0]],"effects":[]}},"squint":{"label":"憋笑抖肩","duration":4000,"left":"/common/robot/squeeze-left.png","right":"/common/robot/squeeze-right.png","effects":[],"motion":{"left":[[0,0,0],[65,0,0],[69,64,64],[74,0,0],[100,0,0]],"right":[[0,0,0],[65,0,0],[69,64,64],[74,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,0,0,0],[21,0,4,0],[28,-3,-4,-3],[35,2,4,3],[42,-2,-3,-2],[49,1,4,2],[59,0,0,0],[100,0,0,0]],"effects":[]}},"unimpressed":{"label":"淡定侧目","duration":6000,"left":"/common/robot/flat-eye.png","right":"/common/robot/flat-eye.png","effects":[],"motion":{"left":[[0,0,0],[48,0,0],[52,64,64],[58,0,0],[100,0,0]],"right":[[0,0,0],[48,0,0],[52,64,64],[58,0,0],[100,0,0]],"gaze":[[0,0,0,0],[14,0,0,0],[29,-13,0,-2],[49,-13,0,-2],[61,0,0,0],[70,0,5,0],[81,0,0,0],[100,0,0,0]],"effects":[]}},"plead":{"label":"可怜求求","duration":5200,"left":"/common/robot/plead-eye.png","right":"/common/robot/plead-eye.png","effects":["/common/robot/tear.png"],"motion":{"left":[[0,0,0],[72,0,0],[76,64,64],[81,0,0],[100,0,0]],"right":[[0,0,0],[72,0,0],[76,64,64],[81,0,0],[100,0,0]],"gaze":[[0,0,0,0],[11,0,0,0],[24,-6,-5,-5],[38,6,-5,5],[49,-4,-6,-3],[60,4,-6,3],[75,0,0,0],[100,0,0,0]],"effects":[{"src":"tear","x":369,"y":128,"size":21,"motion":"smallTear","duration":2200,"followGaze":true,"frames":[[0,1,0,0,0],[13,1,0,0,0],[25,1,3,0.95,0],[60,1,11,0.95,0],[75,1,14,0,0],[91,1,0,0,0],[100,1,0,0,0]]}]}},"dead":{"label":"宕机重启","duration":5800,"left":"/common/robot/cross-eye.png","right":"/common/robot/cross-eye.png","effects":["/common/robot/spark.png"],"motion":{"left":[[0,0,0],[50,0,0],[54,64,64],[60,64,64],[66,0,0],[100,0,0]],"right":[[0,0,0],[50,0,0],[54,64,64],[60,64,64],[66,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,0,0,0],[29,3,12,7],[41,3,12,7],[46,-3,10,5],[51,3,10,6],[56,-2,10,4],[63,0,-4,-2],[72,0,0,0],[100,0,0,0]],"effects":[{"src":"spark","x":233,"y":13,"size":24,"motion":"rebootSpark","duration":5800,"followGaze":false,"frames":[[0,1,0,0,0],[45,1,0,0,0],[53,1,0,1,0],[59,1,0,0,0],[66,1,-3,1,0],[77,1,-6,0,0],[90,1,0,0,0],[100,1,0,0,0]]}]}},"nod":{"label":"收到收到","duration":4400,"left":"/common/robot/open.png","right":"/common/robot/open.png","effects":[],"motion":{"left":[[0,0,0],[21,0,0],[26,64,64],[31,0,0],[44,0,0],[49,64,64],[54,0,0],[100,0,0]],"right":[[0,0,0],[21,0,0],[26,64,64],[31,0,0],[44,0,0],[49,64,64],[54,0,0],[100,0,0]],"gaze":[[0,0,0,0],[10,0,0,0],[17,0,-3,0],[27,0,12,0],[38,0,0,0],[49,0,9,0],[61,0,0,0],[100,0,0,0]],"effects":[]}},"confused":{"label":"左想右想","duration":5800,"left":"/common/robot/open.png","right":"/common/robot/open.png","effects":[],"motion":{"left":[[0,0,0],[14,0,0],[27,27,0],[39,27,0],[53,0,0],[100,0,0]],"right":[[0,0,0],[39,0,0],[56,27,0],[67,27,0],[82,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,0,0,0],[27,-8,0,-7],[39,-8,0,-7],[56,8,0,7],[67,8,0,7],[82,0,0,0],[100,0,0,0]],"effects":[]}},"ok":{"label":"没问题","duration":4800,"left":"/common/robot/caret.png","right":"/common/robot/caret.png","effects":["/common/robot/hand-ok.png"],"motion":{"left":[[0,0,0],[20,0,0],[26,64,64],[35,64,64],[42,0,0],[100,0,0]],"right":[[0,0,0],[63,0,0],[66,64,64],[70,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,-14,0,0],[23,-14,6,-4],[35,-14,0,-4],[48,-14,-3,0],[61,-14,0,0],[77,-14,0,0],[88,0,0,0],[100,0,0,0]],"effects":[{"src":"hand-ok","x":383,"y":56,"size":76,"motion":"handOK","duration":4800,"followGaze":false,"frames":[[0,1,10,0,0],[10,1,10,0,0],[20,1,0,1,0],[32,1,3,1,0],[45,1,-2,1,0],[62,1,0,1,0],[68,1,0,1,0],[77,1,10,0,0],[100,1,10,0,0]]}]}},"like":{"label":"给你点赞","duration":4800,"left":"/common/robot/smile.png","right":"/common/robot/smile.png","effects":["/common/robot/hand-like.png"],"motion":{"left":[[0,0,0],[20,0,0],[24,64,64],[28,0,0],[40,0,0],[44,64,64],[48,0,0],[100,0,0]],"right":[[0,0,0],[20,0,0],[24,64,64],[28,0,0],[40,0,0],[44,64,64],[48,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,-14,4,0],[27,-14,-8,-2],[39,-14,1,0],[51,-14,-5,2],[62,-14,0,0],[77,-14,0,0],[88,0,0,0],[100,0,0,0]],"effects":[{"src":"hand-like","x":383,"y":56,"size":76,"motion":"handLike","duration":4800,"followGaze":false,"frames":[[0,1,11,0,0],[10,1,11,0,0],[20,1,3,1,0],[29,1,-9,1,0],[40,1,0,1,0],[52,1,-6,1,0],[63,1,0,1,0],[68,1,0,1,0],[77,1,11,0,0],[100,1,11,0,0]]}]}},"wave":{"label":"挥手你好","duration":5200,"left":"/common/robot/open.png","right":"/common/robot/open.png","effects":["/common/robot/hand-wave.png"],"motion":{"left":[[0,0,0],[16,0,0],[19,64,64],[22,0,0],[26,0,0],[29,64,64],[32,0,0],[100,0,0]],"right":[[0,0,0],[16,0,0],[19,64,64],[22,0,0],[26,0,0],[29,64,64],[32,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,-14,0,0],[23,-14,1,-5],[35,-14,-2,5],[47,-14,1,-5],[59,-14,-1,4],[68,-14,0,0],[77,-14,0,0],[88,0,0,0],[100,0,0,0]],"effects":[{"src":"hand-wave","x":383,"y":56,"size":76,"motion":"handWave","duration":5200,"followGaze":false,"frames":[[0,1,10,0,0],[10,1,10,0,0],[19,1,0,1,0],[25,1,-2,1,-5],[34,1,0,1,5],[43,1,-2,1,-5],[52,1,0,1,5],[61,1,-1,1,-3],[68,1,0,1,0],[77,1,10,0,0],[100,1,10,0,0]]}]}},"peace":{"label":"开心比耶","duration":4800,"left":"/common/robot/caret.png","right":"/common/robot/caret.png","effects":["/common/robot/hand-peace.png"],"motion":{"left":[[0,0,0],[18,0,0],[23,64,64],[32,64,64],[38,0,0],[100,0,0]],"right":[[0,0,0],[63,0,0],[66,64,64],[70,0,0],[100,0,0]],"gaze":[[0,0,0,0],[12,-14,0,0],[25,-14,-10,-4],[36,-14,1,0],[48,-14,-8,4],[61,-14,0,0],[77,-14,0,0],[88,0,0,0],[100,0,0,0]],"effects":[{"src":"hand-peace","x":383,"y":56,"size":76,"motion":"handPeace","duration":4800,"followGaze":false,"frames":[[0,1,10,0,0],[10,1,10,0,0],[19,1,0,1,0],[26,1,-10,1,0],[37,1,1,1,0],[49,1,-7,1,0],[61,1,0,1,0],[68,1,0,1,0],[77,1,10,0,0],[100,1,10,0,0]]}]}}}

// Generated by npm run physical:assets
const PHYSICAL_GLYPHS = {"time":{"height":114,"chars":{"0":{"key":"time-30","width":60},"1":{"key":"time-31","width":60},"2":{"key":"time-32","width":60},"3":{"key":"time-33","width":60},"4":{"key":"time-34","width":60},"5":{"key":"time-35","width":60},"6":{"key":"time-36","width":60},"7":{"key":"time-37","width":60},"8":{"key":"time-38","width":60},"9":{"key":"time-39","width":60},":":{"key":"time-3a","width":30}}},"heading":{"height":38,"chars":{"0":{"key":"heading-30","width":17},"1":{"key":"heading-31","width":17},"2":{"key":"heading-32","width":17},"3":{"key":"heading-33","width":17},"4":{"key":"heading-34","width":17},"5":{"key":"heading-35","width":17},"6":{"key":"heading-36","width":17},"7":{"key":"heading-37","width":17},"8":{"key":"heading-38","width":17},"9":{"key":"heading-39","width":17},"月":{"key":"heading-6708","width":28},"日":{"key":"heading-65e5","width":28},"周":{"key":"heading-5468","width":28},"一":{"key":"heading-4e00","width":28},"二":{"key":"heading-4e8c","width":28},"三":{"key":"heading-4e09","width":28},"四":{"key":"heading-56db","width":28},"五":{"key":"heading-4e94","width":28},"六":{"key":"heading-516d","width":28}," ":{"key":"heading-20","width":10},"—":{"key":"heading-2014","width":28}}},"weekday":{"height":38,"chars":{"一":{"key":"weekday-4e00","width":26},"二":{"key":"weekday-4e8c","width":26},"三":{"key":"weekday-4e09","width":26},"四":{"key":"weekday-56db","width":26},"五":{"key":"weekday-4e94","width":26},"六":{"key":"weekday-516d","width":26},"日":{"key":"weekday-65e5","width":26},"休":{"key":"weekday-4f11","width":26},"班":{"key":"weekday-73ed","width":26}}},"weekend":{"height":38,"chars":{"一":{"key":"weekend-4e00","width":26},"二":{"key":"weekend-4e8c","width":26},"三":{"key":"weekend-4e09","width":26},"四":{"key":"weekend-56db","width":26},"五":{"key":"weekend-4e94","width":26},"六":{"key":"weekend-516d","width":26},"日":{"key":"weekend-65e5","width":26},"休":{"key":"weekend-4f11","width":26},"班":{"key":"weekend-73ed","width":26}}},"holiday":{"height":32,"chars":{"元":{"key":"holiday-5143","width":24},"旦":{"key":"holiday-65e6","width":24},"除":{"key":"holiday-9664","width":24},"夕":{"key":"holiday-5915","width":24},"春":{"key":"holiday-6625","width":24},"节":{"key":"holiday-8282","width":24},"清":{"key":"holiday-6e05","width":24},"明":{"key":"holiday-660e","width":24},"劳":{"key":"holiday-52b3","width":24},"动":{"key":"holiday-52a8","width":24},"端":{"key":"holiday-7aef","width":24},"午":{"key":"holiday-5348","width":24},"中":{"key":"holiday-4e2d","width":24},"秋":{"key":"holiday-79cb","width":24},"国":{"key":"holiday-56fd","width":24},"庆":{"key":"holiday-5e86","width":24},"休":{"key":"holiday-4f11","width":24},"班":{"key":"holiday-73ed","width":24}}},"workday":{"height":32,"chars":{"班":{"key":"workday-73ed","width":24}}},"day":{"height":53,"chars":{"0":{"key":"day-30","width":22},"1":{"key":"day-31","width":22},"2":{"key":"day-32","width":22},"3":{"key":"day-33","width":22},"4":{"key":"day-34","width":22},"5":{"key":"day-35","width":22},"6":{"key":"day-36","width":22},"7":{"key":"day-37","width":22},"8":{"key":"day-38","width":22},"9":{"key":"day-39","width":22}}},"today":{"height":53,"chars":{"0":{"key":"today-30","width":22},"1":{"key":"today-31","width":22},"2":{"key":"today-32","width":22},"3":{"key":"today-33","width":22},"4":{"key":"today-34","width":22},"5":{"key":"today-35","width":22},"6":{"key":"today-36","width":22},"7":{"key":"today-37","width":22},"8":{"key":"today-38","width":22},"9":{"key":"today-39","width":22}}}}




// Never rotate a native parent layer: updates in that layer showed black seams
// on the user's Band 9. Pixels rotate at asset generation; only rectangles move here.
function physicalAsset(name, flipped) {
  return '/common/physical/' + (flipped ? 'reverse/' : 'forward/') + name + '.png'
}
function orientedSprite(source, flipped) {
  if (!source) return ''
  return physicalAsset(source.slice(source.lastIndexOf('/')+1,-4),flipped)
}
function textRun(id, text, fontName, box, flipped) {
  const font=PHYSICAL_GLYPHS[fontName]
  if(!font||!font.chars)return []
  const fallback=font.chars['—']||font.chars[' ']||null
  const glyphs=String(text).split('').map((char,index)=>({index,glyph:font.chars[char]||fallback})).filter(item=>item.glyph)
  const width=glyphs.reduce((sum,item)=>sum+item.glyph.width,0)
  let x=Math.round(box[0]+(box[2]-width)/2)
  const y=Math.round(box[1]+(box[3]-font.height)/2)
  return glyphs.map(item=>{
    const glyph=item.glyph, result={key:id+'-'+item.index,src:physicalAsset(glyph.key,flipped),style:rectStyle(physicalRect([x,y,glyph.width,font.height],flipped))}
    x+=glyph.width
    return result
  })
}
function pageText(page) {
  let result=[]
  const add=(id,text,font,box)=>{result=result.concat(textRun(id,text,font,box,page.flipped))}
  if(page.displayView==='clock'){
    add('date',page.dateText,'heading',BOXES.heading);add('time',page.timeText,'time',BOXES.clock)
  }else if(page.displayView==='calendar'){
    add('range',page.weekRange,'heading',[40,7,410,38])
    for(let i=0;i<7;i++){
      const b=BOXES['day'+i]
      const mark=page['day'+i+'Mark']||'',festival=page['day'+i+'Festival']||''
      add('weekday'+i,page['day'+i+'Week'],mark==='班'||(!mark&&i>4)?'weekend':'weekday',[b[0],b[1],b[2],38])
      add('day'+i,page['day'+i+'Date'],page['day'+i+'Today']?'today':'day',[b[0],b[1]+38,b[2],53])
      const label=festival||mark
      if(label)add('festival'+i,label,festival||mark==='休'?'holiday':'workday',[b[0],136,b[2],32])
    }

  }
  return result
}
function keepAsset(page) {
  const state=page.keepState==='pending'?'pending':page.keepState==='error'?'error':page.keepState==='on'?(page.keepLabel==='30 分'?'30':'120'):'off'
  return physicalAsset('v091-keep-value-'+state,page.flipped)
}
function carouselAsset(page) {
  return physicalAsset('v091-carousel-'+(page.carouselEnabled===false?'off':'on'),page.flipped)
}

function pageSprites(page, view) {
  const result=[],add=(key,name,box)=>result.push({key,src:physicalAsset(name,page.flipped),style:rectStyle(physicalRect(box,page.flipped))})
  if(view==='menu'){
    add('settings','settings-v091',[0,0,490,192])
    result.push({key:'keep-value',src:keepAsset(page),style:rectStyle(physicalRect(BOXES.keepValue,page.flipped))})
    result.push({key:'carousel-value',src:carouselAsset(page),style:rectStyle(physicalRect(BOXES.carouselValue,page.flipped))})
  }else if(view==='confirm'){
    for(const key of ['confirmText','cancel','confirm'])add(key,key,BOXES[key])
  }else if(view==='calendar'){
    for(let i=0;i<7;i++){
      if(page['day'+i+'Today'])add('today'+i,'today-mark',BOXES['day'+i+'Mark'])
      if(page['day'+i+'Mark']==='休'){
        const before=i>0&&page['day'+(i-1)+'Mark']==='休',after=i<6&&page['day'+(i+1)+'Mark']==='休'
        const shape=before?(after?'middle':'end'):(after?'start':'single')
        add('rest'+i,'rest-'+shape,[BOXES['day'+i][0],136,after?64:62,32])
      }
    }
  }
  if(view==='codex'){
    const percent=Number.parseInt(page.codexPercentText,10)
    add('codex-ring','codex-v082-ring-'+(Number.isFinite(percent)?Math.max(0,Math.min(100,percent)):'empty'),BOXES.codexRing)
    add('codex-window',codexTextAsset('window',page.codexWindowText),BOXES.codexWindow)
    add('codex-logo','codex-v082-logo',BOXES.codexLogo)
    add('codex-plan',codexTextAsset('plan',page.codexPlanText),BOXES.codexPlan)
    add('codex-reset',codexTextAsset('reset',page.codexResetText),BOXES.codexReset)
    add('codex-fresh',codexTextAsset('fresh',page.codexFreshText),BOXES.codexFresh)
  }
  return result.concat(pageText({...page,displayView:view}))
}

const CODEX_CARD_ID = 'codex.rate-limits'
const CODEX_SCHEMA_VERSION = 1
const CODEX_CACHE_KEY = 'codex.rate-limits.snapshot.v1'
const CODEX_DOUBLE_TAP_MS = 420
const CODEX_DOUBLE_TAP_DISTANCE = 44
const CODEX_LOADING_TIMEOUT_MS = 18000

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Business 5× for this plan was explicitly confirmed by the user on 2026-09-22.
// It is a display label, not a multiplier inferred from a quota percentage.
// Pro tiers follow the official desktop billing mapping verified 2026-09-23:
// pro = Pro 20x, prolite = Pro 5x. See docs/subscription-tiers.md.
const CODEX_PLAN_LABELS = {
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

function parseCodexSnapshot(input) {
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

function isNewerCodexSnapshot(currentSessionId, currentRevision, next) {
  if (!next) return false
  return next.sessionId !== currentSessionId || next.revision > currentRevision
}

function codexDoubleTap(previous, at, point) {
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

function codexWindowLabel(minutes) {
  if (minutes >= 7 * 24 * 60) return '本周剩余'
  if (minutes >= 60 && minutes % 60 === 0 && minutes <= 24 * 60) return (minutes / 60) + '小时剩余'
  return '短时剩余'
}

function codexPlanLabel(planType) {
  return CODEX_PLAN_LABELS[planType] || 'ChatGPT'
}

function codexResetText(resetsAt, now) {
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

function codexCardState(snapshot, now, connected) {
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

function codexAck(snapshot, now) {
  return {
    schemaVersion: CODEX_SCHEMA_VERSION,
    type: 'ack',
    cardId: CODEX_CARD_ID,
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    appliedAt: now
  }
}

function codexRefreshRequest(sessionId, revision, now) {
  return {
    schemaVersion: CODEX_SCHEMA_VERSION,
    type: 'refresh_request',
    cardId: CODEX_CARD_ID,
    sessionId: sessionId || '',
    lastRevision: Math.max(0, revision || 0),
    requestedAt: now
  }
}

function codexTextAsset(kind, text) {
  return 'codex-v082-' + kind + '-' + String(text).split('').map(char => char.charCodeAt(0).toString(16)).join('-')
}
