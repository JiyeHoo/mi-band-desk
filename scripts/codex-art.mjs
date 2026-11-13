// Full text rows use the font's natural kerning and baseline; never letter tiles.
import {readFileSync} from 'node:fs'
import {CODEX_PLAN_LABELS,codexResetText,codexTextAsset,codexWindowLabel} from '../src/common/codex-card.js'
const labels={}
const row=(kind,text,width,height,size,color,extra={})=>{
 labels[codexTextAsset(kind,text)]={width,height,size,color,text,codexRow:true,kind,...extra}
}
for(const text of new Set(['ChatGPT',...Object.values(CODEX_PLAN_LABELS)]))row('plan',text,196,38,26,'#ffffff',{weight:600})
for(const text of new Set([codexWindowLabel(10080),codexWindowLabel(1),...Array.from({length:24},(_,i)=>codexWindowLabel((i+1)*60))]))row('window',text,124,30,18,'#d4d8d6',{transparent:true})
const resetTexts=new Set(['等待更新'])
for(let minutes=1;minutes<=60;minutes++)resetTexts.add(codexResetText(minutes*60000,0))
for(let hours=1;hours<=24;hours++)resetTexts.add(codexResetText(hours*3600000,0))
for(let days=1;days<=6;days++)for(let hours=0;hours<24;hours++)resetTexts.add(codexResetText((days*24+hours)*3600000,0))
for(let days=7;days<=100;days++)resetTexts.add(codexResetText(days*86400000,0))
for(const text of resetTexts)row('reset',text,242,38,24,'#ffffff')
for(const text of ['刚刚更新','等待 Mac','连接断开','数据过期',...Array.from({length:99},(_,i)=>(i+1)+'分前')])row('fresh',text,210,32,21,['连接断开','数据过期'].includes(text)?'#efad74':'#b5bcb8')
for(const percent of ['empty',...Array.from({length:101},(_,i)=>i)])labels['codex-v082-ring-'+percent]={width:168,height:168,codexRing:percent}
labels['codex-v082-logo']={width:36,height:36,codexLogo:readFileSync(new URL('./vendor/openai/chatgpt-blossom.svg',import.meta.url),'utf8')}
export const codexLabels=labels
