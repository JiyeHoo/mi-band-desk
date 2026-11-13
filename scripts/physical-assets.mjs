import {codexLabels} from './codex-art.mjs'
import {BOXES} from '../src/common/layout.js'
// Bitmap font cells are rendered once at build time, then rotated losslessly.
export const fonts = {
 time:{size:96,height:114,color:'#80e7cd',chars:'0123456789:',digit:60},
 heading:{size:28,height:38,color:'#9fcbcf',chars:'0123456789月日周一二三四五六 —'},
 weekday:{size:26,height:38,color:'#9fcbcf',chars:'一二三四五六日休班'},
 weekend:{size:26,height:38,color:'#f5a18d',chars:'一二三四五六日休班'},
 holiday:{size:24,height:32,color:'#80e7cd',chars:'元旦除夕春节清明劳动端午中秋国庆休班',transparent:true},
 workday:{size:24,height:32,color:'#f5a18d',chars:'班',transparent:true},
 day:{size:34,height:53,color:'#ffffff',chars:'0123456789',digit:22,transparent:true},
 today:{size:34,height:53,color:'#30251c',chars:'0123456789',digit:22,transparent:true},

}
export const labels = {
 confirmText:{width:290,height:58,size:36,color:'#ffffff',text:'退出桌搭？'},
 'settings-v091':{width:490,height:192,settings:[
  {box:BOXES.keep,color:'#183b34',stroke:'#315e53',text:'常亮',ink:'#fff',size:30,y:72},
  {box:BOXES.carousel,color:'#193443',stroke:'#315568',text:'自动切换',ink:'#fff',size:26,y:72},
  {box:BOXES.exit,color:'#422b30',stroke:'#74505a',text:'退出',ink:'#ffa495',size:30,y:96}
 ]},
 ...codexLabels,
 'codex-v082-loading-0':{width:26,height:26,loading:0,transparent:true},
 'codex-v082-loading-1':{width:26,height:26,loading:1,transparent:true},
 'codex-v082-loading-2':{width:26,height:26,loading:2,transparent:true},
 'codex-v082-loading-3':{width:26,height:26,loading:3,transparent:true},
 ...Object.fromEntries(Object.entries({off:'关',pending:'申请中',error:'失败',30:'30 分',120:'2 小时'}).map(([state,text])=>['v091-keep-value-'+state,{width:BOXES.keepValue[2],height:BOXES.keepValue[3],background:'#183b34',size:28,color:'#c8dedb',text}])),
 'v091-carousel-on':{width:BOXES.carouselValue[2],height:BOXES.carouselValue[3],background:'#193443',toggle:true},
 'v091-carousel-off':{width:BOXES.carouselValue[2],height:BOXES.carouselValue[3],background:'#193443',toggle:false},
 'rest-start':{width:64,height:32,rest:'start'},
 'rest-middle':{width:64,height:32,rest:'middle'},
 'rest-end':{width:62,height:32,rest:'end'},
 'rest-single':{width:62,height:32,rest:'single'},
 'today-mark':{width:52,height:53,fill:'#ffd572',radius:12}
}
export function glyphWidth(font,char) {
 return char===' '?(font.space||10):char===':'?30:char==='%'?(font.percent||font.size):/[0-9]/.test(char)?(font.digit||17):/[A-Z]/.test(char)?(font.letter||font.size):font.size
}
