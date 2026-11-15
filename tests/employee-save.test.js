import { test } from 'node:test'
import assert from 'node:assert/strict'
import { persistEmployee, validateEmployeeFiles } from '../src/lib/employeeSave.js'

test('employee upload retry keeps the saved employee and reuses file requests', async () => {
  const progress = {}, uploads = [], files = {photo:{name:'Photo.JPG',size:100}, identity:{name:'id.pdf',size:100}, other:{name:'contract.pdf',size:200}}
  let saves = 0, attempts = 0, sequence = 0, saved = 0
  const options = {payload:{first_name:'Name', father_name:'Father'}, files, validateFiles:validateEmployeeFiles, makeId:() => String(++sequence),
    saveRecord:async (id,payload) => { saves++; return {id,...payload} }, onSaved:() => saved++,
    uploadFile:async (id,type,file,request) => { uploads.push([id,type,request]); if (type === 'identity' && ++attempts === 1) throw Error('offline') },
  }
  await assert.rejects(persistEmployee(progress, options), /offline/)
  assert.equal(progress.saved.father_name,'Father')
  await persistEmployee(progress, options)
  assert.equal(saves,1)
  assert.equal(saved,1)
  assert.deepEqual(uploads.map(row => row[1]), ['photo','identity','identity','other'])
  assert.deepEqual(uploads[1],uploads[2])
})

test('an uncertain employee save keeps the same ID and invalid files fail before saving', async () => {
  const progress = {}, ids = []
  const options = {files:{}, validateFiles:validateEmployeeFiles, payload:{}, makeId:() => 'stable', onSaved:() => {}, uploadFile:() => {}, saveRecord:async id => { ids.push(id); if (ids.length === 1) throw Error('lost response'); return {id} }}
  await assert.rejects(persistEmployee(progress, options), /lost response/)
  await persistEmployee(progress, options)
  assert.deepEqual(ids,['stable','stable'])
  for (const files of [{photo:{name:'photo.pdf',size:100}}, {other:{name:'script.exe',size:10}}, {identity:{name:'id.pdf',size:5242881}}, {photo:{name:'photo.jpg',size:0}}]) {
    await assert.rejects(persistEmployee({}, {...options, files}), /INVALID_FILE/)
  }
  assert.equal(ids.length,2)
})
