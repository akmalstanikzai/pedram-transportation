import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
const president = crypto.randomUUID(), manager = crypto.randomUUID(), user = crypto.randomUUID()
const driver = crypto.randomUUID(), branch = crypto.randomUUID()
const updated = '2026-11-23T08:00:00Z', nextUpdate = '2026-11-23T08:05:00Z'
const sealed = { ciphertext:'encrypted fixture data with a tag', iv:'abcdefghijklmnop' }

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema pedram_private;
    create table auth.users(id uuid primary key, encrypted_password text, updated_at timestamptz);
    create table public.profiles(id uuid primary key, role text, branch_id uuid, account_enabled boolean);
    create table public.drivers(id uuid primary key, user_id uuid, branch_id uuid, archived_at timestamptz);
  `)
  const migration = new URL('../supabase/migrations/202611230001_driver_password_vault.sql', import.meta.url)
  await db.exec(await readFile(migration, 'utf8'))
  await db.query("insert into auth.users values($1,'fixture hash',$2)", [user, updated])
  await db.query("insert into public.profiles values($1,'president',null,true),($2,'branch_manager',$4,true),($3,'driver',$4,true)", [president, manager, user, branch])
  await db.query("insert into public.drivers values($1,$2,$3,null)", [driver, user, branch])
  const read = (actor = president) => db.query('select public.read_driver_login_password($1,$2,$3) sealed', [actor,driver,user])
  const store = (version = updated) => db.query('select public.store_driver_login_password($1,$2,$3,$4,$5,$6)', [president,driver,user,version,sealed.ciphertext,sealed.iv])
  await db.exec('set role authenticated')
  await assert.rejects(read(), /permission denied/)
  await assert.rejects(store(), /permission denied/)
  await assert.rejects(db.query('select * from pedram_private.driver_password_vault'), /permission denied/)
  await db.exec('set role service_role')
  await assert.rejects(read(manager), /ACCESS_DENIED/)
  await assert.rejects(read(), /PASSWORD_NOT_VAULTED/)
  await store()
  assert.deepEqual((await read()).rows[0].sealed, sealed)
  await db.exec('reset role')
  await db.query("update auth.users set encrypted_password='different link hash',updated_at=$2 where id=$1", [user,nextUpdate])
  await db.exec('set role service_role')
  await assert.rejects(read(), /PASSWORD_NOT_VAULTED/)
  await assert.rejects(store(), /STALE_RECORD/)
  await store(nextUpdate)
  await db.exec('reset role')
  await db.query("update public.drivers set archived_at=now() where id=$1", [driver])
  await db.exec('set role service_role')
  await assert.rejects(read(), /ACCESS_DENIED/)
  await db.exec('reset role')
  assert.deepEqual((await db.query('select action from pedram_private.driver_password_audit order by id')).rows.map(row=>row.action), ['stored','viewed','stored'])
  console.log('Driver password vault permissions, audit, and stale credential rejection passed.')
} finally {
  await db.close()
}
