import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
import {fonts,labels,glyphWidth} from './physical-assets.mjs'
import {spriteNames as sprites} from './sprite-catalog.mjs'
import {unlinkSync,existsSync} from 'node:fs'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const output=join(root,'src/common/physical')
mkdirSync(join(root,'.artifacts'),{recursive:true})
const glyphs={},specs=[]
for(const [name,font]of Object.entries(fonts)){
 glyphs[name]={height:font.height,chars:{}}
 for(const char of font.chars){const key=name+'-'+char.charCodeAt(0).toString(16),width=glyphWidth(font,char);glyphs[name].chars[char]={key,width};specs.push({key,width,height:font.height,...font,char})}
}
for(const[key,label]of Object.entries(labels))specs.push({key,width:label.width||196,height:label.height||128,...label})

const invoke=(...args)=>{const r=spawnSync('npx',['--yes','--package','@playwright/cli','playwright-cli','--session=robot-assets',...args],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0||r.stdout.includes('### Error'))throw new Error(r.stdout+r.stderr);return r.stdout}
for(const direction of ['forward','reverse'])mkdirSync(join(output,direction),{recursive:true})
invoke('open','about:blank')
try{
 const outputText=invoke('run-code',`async(page)=>{
 await page.goto(${JSON.stringify(pathToFileURL(join(root,'design/robot-desk/v3/sprites.html')).href)});
 const assets=await page.evaluate(async ({specs,sprites})=>{
 const out={};const dst=document.createElement('canvas'),ctx=dst.getContext('2d');
 const save=(key,c)=>{for(const flip of [false,true]){dst.width=c.height;dst.height=c.width;ctx.save();ctx.translate(flip?0:c.height,flip?c.width:0);ctx.rotate(flip?-Math.PI/2:Math.PI/2);ctx.drawImage(c,0,0);ctx.restore();out[(flip?'reverse':'forward')+'/'+key+'.png']=dst.toDataURL('image/png').split(',')[1]}};
 for(const [name,data]of Object.entries(sprites)){const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();save(name,img)}
 for(const s of specs){const c=document.createElement('canvas');c.width=s.width;c.height=s.height;const x=c.getContext('2d');if(!s.transparent){x.fillStyle=s.background||'#000';x.fillRect(0,0,c.width,c.height)}
 const text=(value,size,color,y)=>{x.font=(s.weight?s.weight+' ':'')+size+'px Arial, "PingFang SC", sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillStyle=color;x.fillText(value,c.width/2,y)};
 if(s.settings){
 for(const b of s.settings){
 const [bx,by,bw,bh]=b.box;
 x.fillStyle=b.color;x.beginPath();x.roundRect(bx+2,by+2,bw-4,bh-4,30);x.fill();x.strokeStyle=b.stroke;x.lineWidth=2;x.stroke();
 x.font=b.size+'px Arial, "PingFang SC", sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillStyle=b.ink;x.fillText(b.text,bx+bw/2,b.y);
 }
 }
 else if(s.toggle!==undefined){
 x.font='26px Arial, "PingFang SC", sans-serif';x.textAlign='left';x.textBaseline='middle';x.fillStyle=s.toggle?'#fff':'#b5c4cd';x.fillText(s.toggle?'开启':'关闭',0,20);
 x.fillStyle=s.toggle?'#35cc8e':'#566571';x.beginPath();x.roundRect(68,6,44,28,14);x.fill();
 x.fillStyle='#fff';x.beginPath();x.arc(s.toggle?98:82,20,10,0,Math.PI*2);x.fill();
 }
 else if(s.codexRing!==undefined){
 const percent=s.codexRing,cx=84,cy=84,r=76;
 x.strokeStyle='#222b27';x.lineWidth=6;x.lineCap='round';x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.stroke();
 if(percent!=='empty'&&percent>0){x.strokeStyle='#35cc8e';x.beginPath();x.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2*percent/100);x.stroke()}
 const number=percent==='empty'?'—':String(percent);x.font='600 54px Arial, sans-serif';const nw=x.measureText(number).width;
 x.font='500 25px Arial, sans-serif';const uw=x.measureText('%').width,total=nw+3+uw,left=(168-total)/2;
 x.fillStyle='#fff';x.textAlign='left';x.textBaseline='alphabetic';x.font='600 54px Arial, sans-serif';x.fillText(number,left,88);x.font='500 25px Arial, sans-serif';x.fillText('%',left+nw+3,88);
 }
 else if(s.codexLogo){
 const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(s.codexLogo);await img.decode();
 // The source has currentColor (black). Tint the unmodified silhouette white.
 const mask=document.createElement('canvas');mask.width=36;mask.height=36;const mx=mask.getContext('2d');mx.drawImage(img,0,0,36,36);mx.globalCompositeOperation='source-in';mx.fillStyle='#fff';mx.fillRect(0,0,36,36);x.drawImage(mask,0,0);
 }
 else if(s.codexRow){
 const inset=s.kind==='reset'||s.kind==='fresh'?46:0;
 x.font=(s.weight||400)+' '+s.size+'px Arial, "PingFang SC", sans-serif';x.fillStyle=s.color;x.textAlign=s.kind==='window'?'center':'left';x.textBaseline='middle';
 if(x.measureText(s.text).width>c.width-inset)throw new Error('Codex row overflows: '+s.text);
 x.fillText(s.text,s.kind==='window'?c.width/2:inset,c.height/2);
 if(s.kind==='reset'){x.lineWidth=1.8;x.strokeStyle='#b5bcb8';x.beginPath();x.arc(18,19,9,0,Math.PI*2);x.stroke();x.beginPath();x.moveTo(18,13);x.lineTo(18,19);x.lineTo(23,22);x.stroke()}
 if(s.kind==='fresh'){x.fillStyle=s.text==='连接断开'||s.text==='数据过期'?'#efad74':s.text==='等待 Mac'?'#b5bcb8':'#35cc8e';x.beginPath();x.arc(18,16,3,0,Math.PI*2);x.fill()}
 }
 else if(s.loading!==undefined){
 const phase=s.loading*Math.PI/2;x.lineWidth=3;x.lineCap='round';x.strokeStyle='#263330';x.beginPath();x.arc(13,13,9,0,Math.PI*2);x.stroke();
 x.strokeStyle='#ffffff';x.beginPath();x.arc(13,13,9,phase-Math.PI/2,phase+Math.PI/3);x.stroke();
 }
 else if(s.rest){x.fillStyle='#153b32';x.beginPath();x.roundRect(0,0,c.width,c.height,s.rest==='start'?[16,0,0,16]:s.rest==='end'?[0,16,16,0]:s.rest==='middle'?0:16);x.fill()}
 else if(s.fill){x.fillStyle=s.fill;x.beginPath();x.roundRect(0,0,c.width,c.height,s.radius);x.fill()}
 else if(s.card){x.fillStyle=s.card;x.beginPath();x.roundRect(0,0,c.width,c.height,32);x.fill();text(s.text,34,s.color||'#fff',s.value?42:64);if(s.value)text(s.value,30,'#c8dedb',90)}
 else text(s.char===undefined?s.text:s.char,s.size,s.color,c.height/2);save(s.key,c)}
 return out;
 },{specs:${JSON.stringify(specs)},sprites:${JSON.stringify(Object.fromEntries(sprites.map(name=>[name,readFileSync(join(root,'src/common/robot',name+'.png')).toString('base64')])))}});
 return assets;
 }`)
 const match=outputText.match(/### Result\n([\s\S]*?)\n### Ran/);if(!match)throw new Error('Missing generated assets');writeFileSync(join(root,'.artifacts/physical-assets.json'),match[1]);
}finally{invoke('close')}
const assets=JSON.parse(readFileSync(join(root,'.artifacts/physical-assets.json'),'utf8'))
const inventory={}
for(const [name,base64]of Object.entries(assets)){const png=Buffer.from(base64,'base64');writeFileSync(join(output,name),png);inventory[name]=[png.readUInt32BE(16),png.readUInt32BE(20)]}
// Re-encode new Codex PNGs losslessly; whole-row text otherwise adds large zlib streams.
const optimize=spawnSync('python3',[join(root,'scripts/optimize-codex-png.py'),output],{encoding:'utf8'})
if(optimize.status!==0)throw new Error(optimize.stderr||'PNG optimization failed')
console.log(optimize.stdout.trim())
const oldInventory=join(root,'scripts/physical-inventory.json')
if(existsSync(oldInventory))for(const key of Object.keys(JSON.parse(readFileSync(oldInventory))))if(!inventory[key]&&existsSync(join(output,key)))unlinkSync(join(output,key))
writeFileSync(join(root,'src/common/physical-glyphs.js'),'// Generated by npm run physical:assets\nexport const PHYSICAL_GLYPHS = '+JSON.stringify(glyphs)+'\n')
writeFileSync(join(root,'scripts/physical-inventory.json'),JSON.stringify(inventory,null,2)+'\n')
console.log('Generated '+Object.keys(assets).length+' pre-rotated sprite, text and control assets')
