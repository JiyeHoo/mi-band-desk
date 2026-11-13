import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/common/carousel-setting.js',import.meta.url),'utf8')
const {default:createSetting,CAROUSEL_SETTING_KEY}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))

test('default is enabled; stored false restores and malformed values use default',()=>{
  for(const [value,expected] of [[undefined,true],['true',true],['false',false],[{data:'false'},false],['invalid',true]]){
    const states=[]
    const setting=createSetting({get:call=>{assert.equal(call.key,CAROUSEL_SETTING_KEY);call.success(value??call.default)}},v=>states.push(v))
    setting.load();assert.deepEqual(states,[expected])
  }
})
test('late preference reads cannot undo a tap or update a destroyed page',()=>{
  let read;const states=[]
  const setting=createSetting({get:c=>{read=c},set:c=>c.success()},v=>states.push(v))
  setting.load();setting.toggle();read.success('true');assert.deepEqual(states,[false])
  setting.load();setting.dispose();read.success('true');setting.toggle();assert.deepEqual(states,[false])
})
test('writes serialize rapid toggles and persist the final choice even after leaving',()=>{
  const writes=[],states=[]
  const setting=createSetting({set:c=>writes.push(c)},v=>states.push(v))
  setting.toggle();setting.toggle();setting.toggle();setting.toggle()
  assert.deepEqual(states,[false,true,false,true]);assert.equal(writes.length,1)
  setting.dispose();writes[0].success();assert.equal(writes.length,2)
  assert.deepEqual(writes.map(c=>c.value),['false','true']);writes[1].success()
})
