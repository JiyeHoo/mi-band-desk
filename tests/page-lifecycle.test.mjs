import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
const moduleCache=new Map()
function moduleURL(file,parent=import.meta.url){
 const url=new URL(file,parent)
 if(!url.pathname.endsWith('.js'))url.pathname+='.js'
 if(moduleCache.has(url.href))return moduleCache.get(url.href)
 const source=readFileSync(url,'utf8').replace(/from ['"](\.[^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(moduleURL(dep,url)))
 const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');moduleCache.set(url.href,result);return result
}
const readModule = file => import(moduleURL(file))
const clock = await readModule('../src/common/clock.js')
const motion = await readModule('../src/common/robot-motion.js')
const scenes = await readModule('../src/common/robot-scenes.js')
const animation = await readModule('../src/common/animation.js')
const layout = await readModule('../src/common/layout.js')
const physicalUI = await readModule('../src/common/physical-ui.js')
const codex = await readModule('../src/common/codex-card.js')
const { default: createKeepScreen } = await readModule('../src/common/keep-screen.js')
const { default: createDeskCarousel } = await readModule('../src/common/desk-carousel.js')
const { default: createCarouselSetting, CAROUSEL_SETTING_KEY } = await readModule('../src/common/carousel-setting.js')

function createPage(options={}) {
  let time = new Date(2026, 8, 20, 12, 0, 0).getTime()
  let nextId = 0
  let exited = false
  const timers = new Map()
  const requests = []
  const sent = []
  const stored = new Map(Object.entries(options.storage || {}))
  const connection = {
    onmessage:null,onopen:null,onclose:null,onerror:null,
    getReadyState: call => call.success?.({status:options.disconnected?2:1}),
    send: call => {sent.push(call.data);options.sendFail?call.fail?.('offline',1006):call.success?.()}
  }
  const deadlines = new Map()
  const later = (callback, ms, repeat) => { const id=++nextId;timers.set(id,callback);deadlines.set(id,{at:time+ms,ms,repeat});return id }
  const clear = id => { timers.delete(id);deadlines.delete(id) }
  const advance = ms => { const end=time+ms; let guard=0; while(guard++<10000){const ready=[...deadlines].filter(([id,t])=>timers.has(id)&&t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!ready)break;const[id,t]=ready;time=Math.max(time,t.at);const fn=timers.get(id);if(t.repeat)t.at=time+t.ms;else clear(id);fn()}time=end }
  const ux = readFileSync(new URL('../src/pages/index/index.ux', import.meta.url), 'utf8')
  const script = ux.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '').replace('export default', 'globalThis.pageDefinition =')
  const context = vm.createContext({
    ...clock, ...layout, ...motion, ...scenes, ...animation, ...physicalUI, ...codex, Math,
    createKeepScreen: (api, onChange) => createKeepScreen(api, onChange, () => time),
    createDeskCarousel,createCarouselSetting,
    brightness: { setKeepScreenOn: (call) => { requests.push(call.keepScreenOn); options.defer?options.calls.push(call):call.success?.() } },
    interconnect: { instance: () => connection },
    storage: {
      get: call => call.success?.(stored.has(call.key)?stored.get(call.key):(call.default||'')),
      set: call => {stored.set(call.key,call.value);call.success?.()}
    },
    app: { terminate: () => { exited = true } },
    Date: class extends Date { static now() { return time } },
    setInterval: (callback,ms) => later(callback,ms,true),
    clearInterval: clear,
    setTimeout: (callback,ms) => later(callback,ms,false),
    clearTimeout: clear,
    console: { log() {}, warn() {} }
  })
  vm.runInContext(script, context)
  const definition = context.pageDefinition
  const native = { starts: 0, stops: 0, swipes: [] }
  const page = { ...definition.private, $element: id => ({start() {native.starts++}, stop() {native.stops++}, swipeTo({index}) {
    native.swipes.push({id,index,at:time})
    if(options.nativeThrows)throw new Error('unavailable')
  }}) }
  for (const [key, value] of Object.entries(definition)) if (typeof value === 'function') page[key] = value.bind(page)
  page.onInit(); page.onShow()
  return { page, timers, requests, native, advance, sent, stored, connection, stall: (ms) => { time+=ms;advance(0) }, drop: predicate => { for(const [id,fn]of timers)if(predicate(fn))clear(id) }, exited: () => exited,
    tap: (action) => { advance(450); page.armTap(); page.tapAction(action) } }
}

const pose = style => Object.fromEntries(style.split(';').filter(Boolean).map(item=>{const[k,v]=item.split(':');return[k,parseFloat(v)]}))
test('opening shows eyes, one live clock and bounded motion timers; hide and exit clean up', () => {
  const {page,timers,requests,advance,exited,tap}=createPage()
  assert.equal(page.view,'eyes'); assert.equal(page.keepLabel,'关')
  page.onShow(); assert.equal(timers.size,3)
  advance(5000); page.refresh(); assert.equal(page.elapsedText,'00:00:05')
  page.cycleKeep(); assert.equal(requests.at(-1),true)
  page.playEmotion('cry'); assert.equal(timers.size,3)
  const stale=[...timers.values()]
  page.onHide(); assert.equal(timers.size,0); assert.equal(requests.at(-1),false)
  stale.slice(1).forEach(fn=>fn()); assert.equal(page.motionActive,false); assert.equal(timers.size,0)
  advance(30000);page.onShow();advance(2000);page.refresh();assert.equal(page.elapsedText,'00:00:07')
  page.onBackPress();tap('exit');assert.equal(exited(),false)
  tap('confirm');page.onDestroy();assert.equal(exited(),true);assert.equal(timers.size,0);assert.equal(requests.at(-1),false)
})
test('system back always opens settings and only explicit confirmation terminates',()=>{
 const {page,tap,exited}=createPage()
 for(const view of ['eyes','clock','calendar','menu','confirm']){page.view=view;assert.equal(page.onBackPress(),true);assert.equal(page.view,'menu');assert.equal(exited(),false)}
 page.exitApp();assert.equal(exited(),false);tap('exit');tap('cancel');assert.equal(page.view,'menu');assert.equal(exited(),false)
 tap('exit');tap('confirm');assert.equal(exited(),true)
})
test('scenes keep moving between selections, taps vary emotion, timers stay bounded',()=>{
 const {page,timers,advance}=createPage();const first=page.emotion
 const cycle=scenes.ROBOT_SCENES[first].duration*2
 assert.equal(page.motionActive,true);advance(cycle-100);assert.equal(page.motionActive,true);assert.equal(page.emotion,first)
 advance(100);assert.notEqual(page.emotion,first);assert.equal(page.motionActive,true);assert.equal(timers.size,3)
 page.playEmotion('cry');advance(scenes.ROBOT_SCENES.cry.duration*2);assert.notEqual(page.emotion,'cry');assert.equal(page.motionActive,true);assert.equal(timers.size,3)
 page.onHide();assert.equal(timers.size,0)
})
test('full-capsule controls map to matching physical regions in both orientations',()=>{
 for(const [x,y,w,h] of Object.values(layout.BOXES))assert.ok(x>=0&&x+w<=490&&y>=0&&y+h<=192)
 assert.equal(layout.BOXES.cancel[0],0);assert.equal(layout.BOXES.confirm[0]+layout.BOXES.confirm[2],490)
 assert.ok(layout.BOXES.day0[0]<50&&layout.BOXES.day6[0]+layout.BOXES.day6[2]>440)
 for(const flipped of [false,true])for(const names of [['keep','carousel','exit'],['cancel','confirm']]){
  const boxes=names.map(n=>layout.physicalRect(layout.BOXES[n],flipped))
  for(const [x,y,w,h] of boxes){assert.ok(x>=0&&x+w<=192&&y>=0&&y+h<=490);assert.ok(w>=44&&h>=44)}
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const[x,y,w,h]=boxes[i],[a,b,c,d]=boxes[j];assert.ok(x+w<=a||a+c<=x||y+h<=b||b+d<=y)}
 }
})
test('week dates handle Sunday, midnight, leap day and year boundary with exactly one today',()=>{
 for(const date of [new Date(2026,8,20),new Date(2026,8,21),new Date(2024,1,29),new Date(2027,0,1)]){
  const week=clock.weekText(date);assert.equal(week.days.length,7);assert.equal(week.days.filter(d=>d.today).length,1);assert.equal(week.days[(date.getDay()+6)%7].date,''+date.getDate())
 }
 assert.equal(clock.weekText(new Date(2027,0,1)).range,'12月28日 — 1月3日')
 assert.equal(clock.clockText(new Date(2026,8,21,0,0,1)).time,'00:00')
 const {page,advance}=createPage();advance(12*3600000);page.refresh();assert.equal(page.weekRange,'9月21日 — 9月27日')
})
test('emotion selection avoids repeats and all sprite scenes resolve',()=>{
 for(const name of Object.keys(scenes.ROBOT_SCENES))for(const r of [0,.2,.5,.99,1]){const next=motion.chooseEmotion(name,r);assert.notEqual(next,name);assert.ok(scenes.ROBOT_SCENES[next].left);assert.ok(scenes.ROBOT_SCENES[next].effects.length<=3)}
 assert.ok(layout.BOXES.eyes[0]<108);assert.ok(layout.BOXES.eyes[0]+layout.BOXES.eyes[2]>382)
})
test('all moods animate with bounded eyelids and no native transforms',()=>{
 for(const scene of Object.values(scenes.ROBOT_SCENES)){
  const distinct=new Set()
  for(let t=0;t<scene.duration;t+=animation.FRAME_MS){
   const f=animation.sceneFrame(scene,t);distinct.add(JSON.stringify(f))
   for(const value of Object.values(f))assert.ok(!/NaN|Infinity|transform|rotate/.test(value))
   for(const side of ['left','right']){
    const top=pose(f[side+'Top']),bottom=pose(f[side+'Bottom'])
    assert.equal(top.left,0);assert.equal(bottom.left,0);assert.equal(top.opacity,1);assert.equal(bottom.opacity,1)
    assert.ok(top.height>=0&&top.height<=128);assert.ok(Math.abs(bottom.top+bottom.height-128)<.002)
   }
  }
  assert.ok(distinct.size>10,scene.label)
 }
})
test('double blink visibly closes and reopens twice with a resting interval',()=>{
 const scene=scenes.ROBOT_SCENES.blink
 let closed=false,closures=0
 for(let t=0;t<scene.duration;t+=10){
  const f=animation.sceneFrame(scene,t),next=pose(f.leftTop).height+pose(f.leftBottom).height>=112
  if(next&&!closed)closures++;closed=next
 }
 assert.equal(closures,2)
 const rest=animation.sceneFrame(scene,2500);assert.equal(pose(rest.leftTop).height,0);assert.equal(pose(rest.leftBottom).height,0)
})
test('changing from particles to plain eyes clears every effect and every eyelid',()=>{
 const {page}=createPage();page.playEmotion('love');assert.ok(page.effect0)
 page.playEmotion('idle');for(let i=0;i<3;i++){assert.equal(page['effect'+i],'');assert.equal(pose(page['effect'+i+'Motion']).opacity,0)}
 for(const side of ['left','right']){assert.equal(pose(page[side+'Top']).opacity,0);assert.equal(pose(page[side+'Bottom']).opacity,0)}
})
test('60 Hz scheduler compensates work and skips elapsed frames without a catch-up burst',()=>{
 assert.equal(animation.TARGET_FPS,60)
 let t=0,count=0
 while(t<1000){t+=animation.nextFrameDelay(t);count++}
 assert.ok(count>=59&&count<=61)
 assert.ok(animation.nextFrameDelay(651)>0&&animation.nextFrameDelay(651)<=17)
 const {page,timers,stall}=createPage();stall(650);assert.equal(timers.size,3);assert.equal(page.motionActive,true)
})
test('resting holds apply the final open eyelids even when the 60 Hz frame index repeats',()=>{
 const {page,timers,advance}=createPage();page.playEmotion('owo');advance(4234)
 // 4250 / FRAME_MS rounds below 255 in JavaScript, sharing the index at 4234.
 for(const side of ['left','right'])for(const lid of ['Top','Bottom'])assert.equal(pose(page[side+lid]).opacity,1)
 advance(16)
 for(const side of ['left','right'])for(const lid of ['Top','Bottom']){
  const p=pose(page[side+lid]);assert.equal(p.opacity,0);assert.ok(p.width>0&&p.height>0)
 }
 const stale=[...timers.values()].slice(1)
 page.onHide();stale.forEach(fn=>fn());assert.equal(timers.size,0);assert.equal(page.motionActive,false)
 page.onShow();stale.forEach(fn=>fn());assert.equal(timers.size,3);assert.equal(page.motionActive,true)
 page.onHide();assert.equal(timers.size,0)
})
test('callbacks from a hidden session cannot lose handles belonging to a new session',()=>{
 const {page,timers}=createPage();const stale=[...timers.values()].slice(1)
 page.onHide();page.onShow();stale.forEach(fn=>fn());assert.equal(timers.size,3)
 page.onHide();assert.equal(timers.size,0)
})
test('device page never uses native rotation; visual rectangles match unrotated hits',()=>{
 const ux=readFileSync(new URL('../src/pages/index/index.ux',import.meta.url),'utf8')
 assert.doesNotMatch(ux,/transform\s*:|animation-name\s*:|<text[\s>]/)
 for(const flipped of [false,true]){
  const styles=layout.layoutStyles(flipped)
  for(const name of layout.INPUTS)assert.equal(styles[name+'Style'],styles[name+'Hit'])
 }
})
test('physical eyelids never use zero geometry and fully disappear on every open frame',()=>{
 for(const flipped of [false,true])for(const scene of Object.values(scenes.ROBOT_SCENES))for(let t=0;t<scene.duration;t+=17){
  const source=animation.sceneFrame(scene,t),target=animation.sceneFrame(scene,t,flipped)
  for(const side of ['left','right'])for(const lid of ['Top','Bottom']){
   const a=pose(source[side+lid]),b=pose(target[side+lid]);assert.ok(b.width>0&&b.height>0)
   if(a.height<=.5)assert.equal(b.opacity,0)
   else{
    assert.equal(b.opacity,1);assert.ok(b.left>=0&&b.top>=0&&b.left+b.width<=128&&b.top+b.height<=128)
    const pixels=Math.round(animation.sample(scene.motion[side],t,scene.duration)[lid==='Top'?0:1])
    const expected=layout.physicalRect([0,lid==='Bottom'?128-pixels:0,128,pixels],flipped,128,128)
    assert.deepEqual([b.left,b.top,b.width,b.height],expected)
   }
  }
 }
})
test('three centered settings controls fit without overlapping or crossing capsule corners',()=>{
 const ux=readFileSync(new URL('../src/pages/index/index.ux',import.meta.url),'utf8')
 assert.doesNotMatch(ux,/tapAction\('flip'\)|titleImage/)
 for(const key of ['keep','carousel','exit']){
  const [x,y,w,h]=layout.BOXES[key];assert.equal(y+h/2,96)
  // Rounded 32px card outline must fit the physical capsule, not a blanket inset.
  for(let px=x;px<=x+w;px++)for(let py=y;py<=y+h;py++){
   const cx=Math.max(x+32,Math.min(x+w-32,px)),cy=Math.max(y+32,Math.min(y+h-32,py))
   if((px-cx)**2+(py-cy)**2>32**2)continue
   const capX=px<96?96:px>394?394:px
   assert.ok((px-capX)**2+(py-96)**2<=96**2)
  }
 }
})
test('holiday schedule separates the festival day from vacation and marks compensatory work',()=>{
 const week=clock.weekText(new Date(2026,8,25))
 assert.equal(week.days[4].festival,'中秋');assert.equal(week.days[4].mark,'休');assert.equal(week.days[5].festival,'');assert.equal(week.days[5].mark,'休')
 assert.equal(clock.weekText(new Date(2026,8,20)).days[6].mark,'班')
 const feb=clock.weekText(new Date(2026,1,17));assert.equal(feb.days[0].festival,'除夕');assert.equal(feb.days[1].festival,'春节')
 const unknown=clock.weekText(new Date(2027,0,1));assert.equal(unknown.days[4].festival,'元旦');assert.ok(unknown.days.every(d=>d.mark===''))
 const {page,advance}=createPage();page.setView('calendar','left');advance(220)
 assert.ok(page.calendarSprites.some(s=>s.src.includes('workday-73ed')))
})
test('new gestures appear only during selected scenes and selective eye motion always returns',()=>{
 assert.equal(Object.keys(scenes.ROBOT_SCENES).length,26)
 for(const [name,scene]of Object.entries(scenes.ROBOT_SCENES)){
  const hands=scene.effects.filter(s=>s.includes('hand-'));assert.ok(hands.length<=1)
  if(hands.length){
   assert.ok(['ok','like','wave','peace'].includes(name))
   assert.equal(pose(animation.sceneFrame(scene,0,false).effect0Motion).opacity,0)
   assert.equal(pose(animation.sceneFrame(scene,scene.duration*.4,false).effect0Motion).opacity,1)
   assert.equal(pose(animation.sceneFrame(scene,scene.duration*.9,false).effect0Motion).opacity,0)
  }
  for(const t of [0,scene.duration*.99]){
   const frame=animation.sceneFrame(scene,t,false)
   assert.deepEqual([pose(frame.leftEyeStyle).left,pose(frame.leftEyeStyle).top],layout.physicalRect(layout.BOXES.leftEye,false).slice(0,2))
  }
 }
 const {page}=createPage();page.playEmotion('ok');assert.ok(page.effect0.includes('hand-ok'));page.playEmotion('blink');assert.equal(page.effect0,'')
})

const start=(p,x,y)=>p.armTap({touches:[{clientX:x,clientY:y}]})
const move=(p,x,y)=>p.trackMove({touches:[{clientX:x,clientY:y}]})
const end=(p,x,y)=>p.finishTouch({touches:[],changedTouches:[{clientX:x,clientY:y}]})

test('automatic requests animate only the native desk pager and wait for its index',()=>{
 const {page,native,advance,timers}=createPage()
 advance(59999);assert.equal(native.swipes.length,0)
 advance(1);assert.equal(native.swipes.length,1);assert.equal(native.swipes[0].id,'desktops');assert.equal(native.swipes[0].index,1)
 assert.equal(page.view,'eyes');assert.equal(page.deskIndex,0)
 for(const index of [1,2,3,0]){
  page.onNativeStart();page.onDeskChange({index});page.onDeskEnd({index})
  assert.equal(page.view,['eyes','clock','calendar','codex'][index])
  advance((index===0?60000:10000)-1);assert.equal(native.swipes.at(-1).index,index)
  advance(1);assert.equal(native.swipes.at(-1).index,(index+1)%4)
 }
 page.onHide();const count=native.swipes.length;advance(120000);assert.equal(native.swipes.length,count);assert.equal(timers.size,0)
 page.onShow();advance(59000);assert.equal(native.swipes.length,count)
})
test('manual paging, held pointers, settings and refresh do not fight automatic rotation',()=>{
 const {page,native,advance}=createPage();advance(59000)
 start(page,96,320);page.onNativeStart();page.onDeskChange({index:1})
 advance(45000);assert.equal(native.swipes.length,0)
 end(page,96,100);page.onDeskEnd({index:1});advance(29000);assert.equal(native.swipes.length,0)
 page.onBackPress();advance(120000);assert.equal(page.view,'menu');assert.equal(native.swipes.length,0)
 page.onOuterEnd({index:1});advance(29000);assert.equal(native.swipes.length,0)
 page.setView('codex');advance(300);start(page,90,250);end(page,90,250);advance(200);start(page,90,250);end(page,90,250)
 assert.equal(page.codexLoading,true);advance(18100);assert.equal(page.codexLoading,false);assert.equal(native.swipes.length,0)
 advance(13000);assert.equal(native.swipes.at(-1).index,0)
})
test('missing or rejected native auto requests do not freeze the eyes or hammer the pager',()=>{
 for(const nativeThrows of [true,false]){
  const {page,native,advance}=createPage({nativeThrows});advance(60000);assert.equal(native.swipes.length,1)
  advance(5000);assert.equal(page.motionActive,true);assert.equal(native.swipes.length,1);assert.equal(page.view,'eyes')
  page.onHide();advance(120000);assert.equal(native.swipes.length,1)
 }
})

test('native indices own page selection; no per-move page building or JS position writes',()=>{
 const {page,advance}=createPage(),clockImages=page.clockSprites,calendarImages=page.calendarSprites
 start(page,96,320);page.onNativeStart();assert.equal(page.motionActive,false)
 for(let y=300;y>=100;y-=20){advance(16);move(page,96,y)}
 assert.equal(page.view,'eyes');assert.equal(page.clockSprites,clockImages);assert.equal(page.calendarSprites,calendarImages)
 assert.equal(page.cardStyle,undefined);assert.equal(page.incomingStyle,undefined)
 end(page,96,100);page.onDeskChange({index:1});assert.equal(page.view,'clock')
 page.onDeskEnd({index:1});assert.equal(page.motionActive,false)
 page.onDeskChange({index:2});assert.equal(page.view,'calendar')
 page.onDeskChange({index:3});assert.equal(page.view,'codex')
 page.onOuterChange({index:0});assert.equal(page.view,'menu');assert.equal(page.homeView,'codex')
 page.onOuterEnd({index:1});assert.equal(page.view,'codex')
 page.onDeskEnd({index:0});assert.equal(page.view,'eyes');assert.equal(page.motionActive,true)
})
test('Codex card accepts only newer snapshots, caches them and emits explicit messages',()=>{
 const {page,sent,stored,connection,advance}=createPage();const at=new Date(2026,8,20,12,0,0).getTime()
 const snapshot={schemaVersion:1,type:'snapshot',cardId:'codex.rate-limits',sourceId:'mac-test',accountKey:'default',revision:2,sessionId:'session-a',fetchedAt:at,expiresAt:at+600000,payload:{planType:'self_serve_business_prolite',selectedWindowId:'codex.primary',windows:[{id:'codex.primary',label:'本周',usedPercent:3,remainingPercent:97,windowDurationMins:10080,resetsAt:at+5*86400000}]}}
 assert.equal(page.codexConnected,true);assert.equal(page.codexPercentText,'—%');assert.equal(sent.at(-1).type,'refresh_request')
 connection.onmessage({data:JSON.stringify(snapshot)});assert.equal(page.codexPercentText,'97%');assert.equal(page.codexPlanText,'Business 5×');assert.equal(page.codexFreshText,'刚刚更新');assert.equal(sent.at(-1).type,'ack')
 assert.ok(stored.has(codex.CODEX_CACHE_KEY));const count=sent.length
 connection.onmessage({data:JSON.stringify(snapshot)});assert.equal(sent.length,count+1);assert.equal(sent.at(-1).type,'ack');assert.equal(sent.at(-1).revision,2)
 const afterDuplicate=sent.length;connection.onmessage({data:JSON.stringify({...snapshot,revision:1})});assert.equal(sent.length,afterDuplicate);assert.equal(page.codexPercentText,'97%')
 page.setView('codex');advance(300);start(page,52,220);end(page,52,220);advance(180);start(page,72,250);end(page,72,250)
 assert.equal(sent.at(-1).type,'refresh_request');assert.equal(sent.at(-1).lastRevision,2);assert.equal(page.codexLoading,true)
 assert.ok(page.codexLoadingImage.includes('codex-v082-loading-0'))
 connection.onmessage({data:JSON.stringify(snapshot)});assert.equal(sent.at(-1).type,'ack');assert.equal(page.codexLoading,true)
 connection.onmessage({data:JSON.stringify({...snapshot,revision:3,fetchedAt:at+1000,expiresAt:at+601000})});assert.equal(page.codexLoading,false)
 connection.onclose();assert.equal(page.codexFreshText,'连接断开')
})
test('Codex short-window cache renders on startup without a missing-glyph crash',()=>{
 const at=new Date(2026,8,20,12,0,0).getTime()
 const snapshot={schemaVersion:1,type:'snapshot',cardId:'codex.rate-limits',sourceId:'mac-test',accountKey:'default',revision:2,sessionId:'session-a',fetchedAt:at,expiresAt:at+600000,payload:{selectedWindowId:'codex.primary',windows:[{id:'codex.primary',label:'短时',usedPercent:20,remainingPercent:80,windowDurationMins:300,resetsAt:at+4*3600000}]}}
 const {page}=createPage({storage:{[codex.CODEX_CACHE_KEY]:JSON.stringify(snapshot)}})
 assert.equal(page.codexWindowText,'5小时剩余')
 assert.ok(page.codexSprites.some(sprite=>sprite.key==='codex-window'&&sprite.src.includes(codex.codexTextAsset('window','5小时剩余'))))
 assert.equal(page.codexSprites.length,6)
})
test('bitmap text ignores an unknown glyph instead of aborting the page',()=>{
 assert.doesNotThrow(()=>physicalUI.textRun('bad','未知?','codexLabel',layout.BOXES.codexWindow,false))
})
test('Codex double tap ignores drags, prevents duplicate refresh and times loading out',()=>{
 const {page,sent,advance}=createPage();page.setView('codex');advance(300);const initial=sent.length,sprites=page.codexSprites
 start(page,80,210);move(page,80,250);end(page,80,250);advance(150);start(page,80,210);end(page,80,210);assert.equal(sent.length,initial)
 advance(500);start(page,20,80);end(page,20,80);advance(200);start(page,25,105);end(page,25,105)
 assert.equal(sent.length,initial+1);assert.equal(page.codexLoading,true);assert.equal(page.codexSprites,sprites)
 advance(100);start(page,100,300);end(page,100,300);advance(100);start(page,100,300);end(page,100,300);assert.equal(sent.length,initial+1)
 advance(18100);assert.equal(page.codexLoading,false)
})
test('native start/end and change can arrive in either order without duplicate navigation',()=>{
 for(const changeFirst of [false,true]){
  const {page,advance}=createPage();start(page,96,320);page.onNativeStart();move(page,96,120)
  if(changeFirst)page.onDeskChange({index:1})
  end(page,96,120);page.onDeskEnd({index:1})
  if(!changeFirst)page.onDeskChange({index:1})
  advance(500);assert.equal(page.view,'clock');assert.equal(page.deskIndex,1)
  page.onDeskChange({index:2});page.onDeskChange({index:0});page.onDeskEnd({index:0})
  assert.equal(page.view,'eyes');assert.equal(page.motionActive,true)
 }
})
test('fresh taps work and a canceled or missed end never leaves controls suppressed',()=>{
 const {page,advance,tap}=createPage();page.tapAction('respond');assert.equal(page.motionActive,true)
 page.setView('menu');advance(250);page.tapAction('keep');assert.equal(page.keepLabel,'30 分')
 start(page,96,200);move(page,140,200);end(page,140,200);page.tapAction('exit');assert.equal(page.view,'menu')
 advance(251);page.tapAction('exit');assert.equal(page.view,'confirm');tap('cancel')
 start(page,90,200);move(page,140,200);page.cancelTouch();page.tapAction('exit');assert.equal(page.view,'menu')
 advance(251);page.tapAction('exit');assert.equal(page.view,'confirm')
 page.setView('eyes');advance(300);start(page,96,250);page.onNativeStart();advance(2100)
 assert.equal(page.motionActive,true)
 start(page,96,250);end(page,96,250);page.tapAction('respond');assert.equal(page.motionActive,true)
})
test('short drag return preserves page and all prebuilt images without reset overlays',()=>{
 const {page,advance}=createPage();page.setView('clock');advance(300)
 const images=page.clockSprites
 start(page,96,260);advance(400);move(page,96,240);page.onNativeStart();end(page,96,240);page.onDeskEnd({index:1})
 assert.equal(page.view,'clock');assert.equal(page.clockSprites,images)
 page.onDeskChange({index:-1});page.onOuterChange({index:2});assert.equal(page.view,'clock')
})
test('hide and exit cancel input recovery and ignore late native callbacks',()=>{
 const {page,timers,advance}=createPage();start(page,96,260);page.onNativeStart();end(page,96,120)
 const stale=[...timers.values()];page.onHide();assert.equal(timers.size,0)
 stale.forEach(fn=>fn());page.onDeskEnd({index:2});page.onOuterEnd({index:0});assert.equal(timers.size,0);assert.equal(page.view,'eyes')
 page.onShow();assert.equal(page.motionActive,true);advance(300);assert.equal(timers.size,3)
})
test('keep updates only a fixed-size value image; fast success skips pending and delayed requests clean up',()=>{
 const {page,tap}=createPage();page.setView('menu');const background=page.settingsImage,geometry=page.keepValueStyle
 tap('keep');assert.match(page.keepImage,/keep-value-30\.png$/)
 tap('keep');assert.match(page.keepImage,/keep-value-120\.png$/)
 tap('keep');assert.match(page.keepImage,/keep-value-off\.png$/)
 assert.equal(page.settingsImage,background);assert.equal(page.keepValueStyle,geometry)
 const calls=[];const slow=createPage({defer:true,calls});calls.at(-1).success();slow.page.cycleKeep()
 assert.match(slow.page.keepImage,/keep-value-off\.png$/);slow.advance(121);assert.match(slow.page.keepImage,/keep-value-pending\.png$/)
 calls.at(-1).success();assert.match(slow.page.keepImage,/keep-value-30\.png$/)
 slow.page.cycleKeep();slow.page.onHide();slow.advance(200);assert.equal(slow.timers.size,0)
})
test('calendar footer prioritizes a festival and joins only consecutive official rest days',()=>{
 const make=date=>{const w=clock.weekText(date),p={flipped:false,weekRange:w.range,todayText:w.today};w.days.forEach((d,i)=>{p['day'+i+'Week']=d.label;p['day'+i+'Date']=d.date;p['day'+i+'Today']=d.today;p['day'+i+'Mark']=d.mark;p['day'+i+'Festival']=d.festival});return p}
 const p=make(new Date(2026,8,25)),sprites=physicalUI.pageSprites(p,'calendar')
 const weekdays=sprites.filter(s=>s.key.startsWith('weekday'));assert.equal(weekdays.length,7)
 const festival=sprites.filter(s=>s.key.startsWith('festival4'));assert.equal(festival.length,2)
 assert.ok(festival[0].src.includes('4e2d'));assert.ok(!festival.some(s=>s.src.includes('4f11')))
 const rest=sprites.filter(s=>s.key.startsWith('rest'));assert.equal(rest.length,3)
 assert.ok(rest[0].src.includes('rest-start'));assert.ok(rest[1].src.includes('rest-middle'));assert.ok(rest[2].src.includes('rest-end'))
 const box=pose(rest[0].style),next=pose(rest[1].style);assert.equal(box.top+box.height,next.top)
 const work=physicalUI.pageSprites(make(new Date(2026,8,20)),'calendar');assert.ok(work.some(s=>s.key.startsWith('festival6')&&s.src.includes('workday')));assert.ok(!work.some(s=>s.key.startsWith('rest')))
})
test('clock/calendar images refresh only with data changes, never on each touch',()=>{
 const {page,advance}=createPage(),c=page.clockSprites,d=page.calendarSprites
 advance(5000);assert.equal(page.clockSprites,c);assert.equal(page.calendarSprites,d)
 advance(60000);assert.notEqual(page.clockSprites,c);assert.equal(page.calendarSprites,d)
 for(const s of page.calendarSprites){const p=pose(s.style);assert.ok(p.left>=0&&p.top>=0&&p.left+p.width<=192&&p.top+p.height<=490)}
})
test('carousel setting changes only its fixed state image and persists across launches',()=>{
 const {page,tap,advance,native,stored}=createPage()
 assert.equal(page.carouselEnabled,true)
 page.setView('menu');const background=page.settingsImage,keep=page.keepImage,geometry=page.carouselValueStyle
 tap('carousel');assert.equal(page.carouselEnabled,false);assert.match(page.carouselImage,/carousel-off\.png$/)
 assert.equal(stored.get(CAROUSEL_SETTING_KEY),'false')
 assert.equal(page.settingsImage,background);assert.equal(page.keepImage,keep);assert.equal(page.carouselValueStyle,geometry)
 page.setView('clock');advance(90000);assert.equal(native.swipes.length,0)
 page.onHide();page.onShow();advance(90000);assert.equal(native.swipes.length,0)
 page.onDestroy()
 const next=createPage({storage:Object.fromEntries(stored)})
 assert.equal(next.page.carouselEnabled,false);next.advance(90000);assert.equal(next.native.swipes.length,0)
 next.page.setView('menu');next.tap('carousel');assert.equal(next.page.carouselEnabled,true)
 next.page.setView('clock');next.advance(29000);assert.equal(next.native.swipes.length,0)
 next.advance(2000);assert.equal(next.native.swipes.at(-1).index,2)
 assert.equal(next.stored.get(CAROUSEL_SETTING_KEY),'true')
 next.page.onDestroy()
})
test('dragging and cancelled touches on carousel control never toggle the preference',()=>{
 const {page,advance}=createPage();page.setView('menu');advance(500)
 const point=(x,y)=>({touches:[{clientX:x,clientY:y}]})
 page.armTap(point(96,245));page.trackMove(point(110,245));page.finishTouch(point(110,245));page.tapAction('carousel')
 assert.equal(page.carouselEnabled,true)
 advance(500);page.armTap(point(96,245));page.cancelTouch();page.tapAction('carousel');assert.equal(page.carouselEnabled,true)
 page.onDestroy()
})
