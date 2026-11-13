import {codexTextAsset} from './codex-card'
import { BOXES, physicalRect, rectStyle } from './layout'
import { PHYSICAL_GLYPHS } from './physical-glyphs'
// Never rotate a native parent layer: updates in that layer showed black seams
// on the user's Band 9. Pixels rotate at asset generation; only rectangles move here.
export function physicalAsset(name, flipped) {
  return '/common/physical/' + (flipped ? 'reverse/' : 'forward/') + name + '.png'
}
export function orientedSprite(source, flipped) {
  if (!source) return ''
  return physicalAsset(source.slice(source.lastIndexOf('/')+1,-4),flipped)
}
export function textRun(id, text, fontName, box, flipped) {
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
export function pageText(page) {
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
export function keepAsset(page) {
  const state=page.keepState==='pending'?'pending':page.keepState==='error'?'error':page.keepState==='on'?(page.keepLabel==='30 分'?'30':'120'):'off'
  return physicalAsset('v091-keep-value-'+state,page.flipped)
}
export function carouselAsset(page) {
  return physicalAsset('v091-carousel-'+(page.carouselEnabled===false?'off':'on'),page.flipped)
}

export function pageSprites(page, view) {
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
