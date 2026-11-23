import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
const [president, trader, user, branchManager] = Array.from({length:4},()=>crypto.randomUUID())
const version='2026-11-23T09:00:00.123456Z'
const iv='abcdefghijklmnop'
const ciphertext='sealed fixture password ciphertext'

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, encrypted_password text, updated_at timestamptz, raw_app_meta_data jsonb);
    create table public.profiles(id uuid primary key, role text, account_enabled boolean);
    create table public.traders(id uuid primary key, user_id uuid, archived_at timestamptz);
  `)
  const migrations=new URL('../supabase/migrations/',import.meta.url)
  for (const name of ['202611090006_trader_password_vault.sql','202611230004_verify_trader_password_vault.sql']) {
    await db.exec(await readFile(new URL(name,migrations),'utf8'))
  }
  await db.query("insert into auth.users values($1,'fixture hash',$2,jsonb_build_object('pedram_trader_password_iv',$3::text))",[user,version,iv])
  await db.query("insert into public.profiles values($1,'president',true),($2,'trader',true),($3,'branch_manager',true)",[president,user,branchManager])
  await db.query('insert into public.traders values($1,$2,null)',[trader,user])
  await db.query('insert into public.trader_password_vault(trader_id,ciphertext,iv,updated_by) values($1,$2,$3,$4)',[trader,ciphertext,iv,president])
  const call=async (action,actor=president,stamp=null,marker=null)=> (await db.query(
    'select public.trader_login_password($1,$2,$3,$4,$5,$6,$7) result',[actor,trader,user,action,stamp,stamp?ciphertext:null,marker])).rows[0].result
  await db.exec('set role authenticated')
  await assert.rejects(call('status'),/permission denied/)
  await db.exec('set role service_role')
  await assert.rejects(call('reveal',branchManager),/ACCESS_DENIED/)
  assert.deepEqual(await call('status'),{saved:false})
  await assert.rejects(call('reveal'),/PASSWORD_NOT_VAULTED/)
  await assert.rejects(call('store',president,version,'1234567890123456'),/STALE_RECORD/)
  assert.deepEqual(await call('store',president,'2026-11-23T09:00:00.123457Z',iv),{saved:true})
  assert.deepEqual(await call('reveal'),{ciphertext,iv})
  await db.exec('reset role')
  await db.query("update auth.users set encrypted_password='changed outside the account function',updated_at=now() where id=$1",[user])
  await db.exec('set role service_role')
  await assert.rejects(call('reveal'),/PASSWORD_NOT_VAULTED/)
  await assert.rejects(call('store',president,version,iv),/STALE_RECORD/)
  await db.exec('reset role')
  const audit=await db.query('select action from public.trader_password_vault_audit order by id')
  assert.deepEqual(audit.rows.map(row=>row.action),['stored','viewed'])
  console.log('Trader vault access, audit, and stale password rejection passed.')
} finally {
  await db.close()
}
