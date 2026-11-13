import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/common/desk-carousel.js',import.meta.url),'utf8')
const {default:createDeskCarousel}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))

const harness=()=>{let time=0;const carousel=createDeskCarousel(()=>time);carousel.show(0);return {carousel,advance:ms=>{time+=ms}}}
test('eyes dominate the native-confirmed 60/10/10/10 second cycle',()=>{
  const {carousel:c,advance}=harness()
  advance(59999);assert.equal(c.next(false),null)
  for(const index of [1,2,3,0]){
    advance(1);assert.equal(c.next(false),index)
    c.nativeStart();c.select(index);c.nativeEnd()
    advance((index===0?60000:10000)-1);assert.equal(c.next(false),null)
  }
  advance(1);assert.equal(c.next(false),1)
})
test('manual reading gets 30 seconds; held touch and cancellation take precedence',()=>{
  const {carousel:c,advance}=harness();c.select(1)
  advance(29999);assert.equal(c.next(false),null)
  c.input(true);advance(45000);assert.equal(c.next(false),null)
  c.input(false);advance(29999);assert.equal(c.next(false),null)
  advance(1);assert.equal(c.next(false),2)
  c.select(2);c.nativeEnd();c.select(-1);advance(300000);assert.equal(c.next(false),null)
  c.select(2);advance(30000);assert.equal(c.next(false),3)
})
test('missing touch/native events recover without bursts or inventing a selected page',()=>{
  const {carousel:c,advance}=harness();c.select(1);c.input(true)
  advance(120000);assert.equal(c.next(false),null)
  advance(10000);assert.equal(c.next(false),2)
  advance(2000);assert.equal(c.next(false),null)
  advance(9999);assert.equal(c.next(false),null)
  advance(1);assert.equal(c.next(false),2)
  c.select(2);advance(2000);assert.equal(c.next(false),null)
  advance(8000);assert.equal(c.next(false),3)
})
test('hide, restart, loading and failed calls preserve a full dwell without catch-up',()=>{
  const {carousel:c,advance}=harness();advance(90000)
  assert.equal(c.next(true),null);assert.equal(c.next(false),1);c.rejected()
  advance(59000);assert.equal(c.next(false),null)
  c.stop();advance(1000000);assert.equal(c.next(false),null)
  c.show(0);advance(59999);assert.equal(c.next(false),null)
  advance(1);assert.equal(c.next(false),1)
})
test('disabled rotation survives show and manual paging; enabling starts a new dwell',()=>{
  const {carousel:c,advance}=harness();c.setEnabled(false)
  advance(120000);assert.equal(c.next(false),null)
  c.show(1);c.select(2);advance(60000);assert.equal(c.next(false),null)
  c.setEnabled(true);advance(9999);assert.equal(c.next(false),null)
  advance(1);assert.equal(c.next(false),3)
  c.setEnabled(false);c.select(3);c.nativeEnd();advance(60000);assert.equal(c.next(false),null)
})
