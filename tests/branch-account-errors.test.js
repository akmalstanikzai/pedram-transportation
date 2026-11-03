import { test } from 'node:test'
import assert from 'node:assert/strict'
import { branchAccountError } from '../src/lib/branchAccountError.js'

test('missing function and CORS failures give deployment guidance', async () => {
  assert.equal((await branchAccountError(null, { context: new Response(JSON.stringify({code:'NOT_FOUND',message:'Requested function was not found'}), {status:404}) })).message, 'BRANCH_FUNCTION_MISSING')
  assert.equal((await branchAccountError(null, {name:'FunctionsFetchError',message:'Failed to fetch'})).message, 'BRANCH_FUNCTION_UNREACHABLE')
})
test('authentication and business errors remain distinguishable', async () => {
  assert.equal((await branchAccountError(null, {context:new Response(JSON.stringify({message:'Invalid JWT'}),{status:401})})).message, 'BRANCH_SESSION_INVALID')
  assert.equal((await branchAccountError(null, {context:new Response(JSON.stringify({error:'ACCOUNT_MISSING'}),{status:400})})).message, 'ACCOUNT_MISSING')
})
