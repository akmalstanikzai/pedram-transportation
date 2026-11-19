import {test} from 'node:test'
import assert from 'node:assert/strict'
import {connectCleanter, printCleanterImages} from '../src/lib/cleanterPrinting.js'

test('Cleanter connects only to the on-device bridge',async () => {
  const requests=[]
  await connectCleanter(async (url,options) => {
    requests.push(url)
    assert.ok(options.signal instanceof AbortSignal)
    return {ok:true}
  })
  assert.deepEqual(requests,['http://localhost:9100/health'])
  await assert.rejects(connectCleanter(async () => ({ok:false})),/CLEANTER_UNAVAILABLE/)
})

test('a blocked Chrome device permission returns a clear error without sending a receipt',async () => {
  let requests=0
  await assert.rejects(connectCleanter(async()=>{requests++;return {ok:true}}, {
    query:async({name})=>{assert.equal(name,'local-network-access');return {state:'denied'}},
  }),/CLEANTER_PERMISSION_DENIED/)
  assert.equal(requests,0)
})

test('older browsers without the local-device permission API can still connect',async () => {
  let requests=0
  await connectCleanter(async()=>{requests++;return {ok:true}}, {
    query:async()=>{throw new TypeError('Unknown permission')},
  })
  assert.equal(requests,1)
})

test('receipt images print as one continuous job with binary PNG data and minimal paper feed',async () => {
  const bytes=Uint8Array.from({length:20000},(_,i)=>i%256)
  const images=[new Blob([bytes],{type:'image/png'}),new Blob(['second image'],{type:'image/png'})]
  for (const paper of ['80','58']) {
    const requests=[]
    await printCleanterImages(images,paper,async (url,options) => {
      requests.push(url)
      assert.equal(options.method,'POST')
      assert.equal(options.headers['Content-Type'],'application/json')
      const job=JSON.parse(options.body)
      assert.equal(job.paperWidth,Number(paper))
      assert.equal(job.cut,false)
      assert.equal(job.content.length,3)
      assert.deepEqual(job.content.at(-1),{type:'feed',lines:1})
      assert.deepEqual(new Uint8Array(Buffer.from(job.content[0].base64,'base64')),bytes)
      assert.equal(Buffer.from(job.content[1].base64,'base64').toString(),'second image')
      assert.ok(job.content.slice(0,-1).every(block=>block.type==='image'&&block.dither===false))
      return {ok:true,json:async()=>({status:'printed'})}
    })
    assert.deepEqual(requests,['http://localhost:9100/print'])
  }
})

test('failed or unconfirmed printing is not automatically retried',async () => {
  for(const response of [
    {ok:false,json:async()=>({error:'printer_unreachable'})},
    {ok:true,json:async()=>({status:'queued'})},
    {ok:true,json:async()=>{throw new Error('Invalid response')}},
  ]) {
    let attempts=0
    await assert.rejects(printCleanterImages([new Blob(['receipt'])],'80',async()=>{attempts++;return response}))
    assert.equal(attempts,1,'a retry could print the same receipt twice')
  }
})
