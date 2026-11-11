// Runs against disposable PostgreSQL only; never connects to hosted Supabase.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { ownerFormFromRow, ownerFormPayload } from '../src/lib/ownerForm.js'
if (!process.env.PEDRAM_PGLITE_PATH) throw new Error('PEDRAM_PGLITE_PATH is required')
const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
const uid = () => crypto.randomUUID()
const president = uid(), manager = uid()
const call = async (name,args) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`, args.map(value=>typeof value==='object'&&value!==null?JSON.stringify(value):value))).rows[0].result
await db.exec(`create schema auth;create schema storage;create role anon;create role authenticated;create role service_role bypassrls;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',unique(bucket_id,name));
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;grant select on storage.buckets to authenticated;`)
try {
  for (const name of (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('.sql') && name < '202611110004').sort()) {
    try { await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')) }
    catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }) }
  }
  await db.query('insert into auth.users(id) values($1),($2)', [president, manager])
  await db.query("update public.profiles set role='president' where id=$1", [president])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [president])
  await db.exec('set role authenticated')
  const oldData = { full_name: 'Legacy Owner Name', phone: '0700000000', national_id: 'original-id', notes: 'Keep notes', province: 'Kabul', address: 'Original full home address', branch_id: null }
  const legacy = await call('save_fleet_record', ['owner', null, uid(), oldData, null])
  const legacyFile = uid()
  const legacyPath = await call('reserve_fleet_document', [legacyFile, 'owner', legacy, 'identity', 'original-tazkira.pdf', 'application/pdf', 100, null])
  await db.query("insert into storage.objects(bucket_id,name) values('fleet-documents',$1)", [legacyPath])
  await call('complete_fleet_document', [legacyFile])
  await db.exec('reset role')
  const migration = await readFile(new URL('../supabase/migrations/202611110004_owner_form_details.sql', import.meta.url), 'utf8')
  await db.exec(migration.replace(/\r?\n/g, '\r\n'))
  await db.exec(migration.replace(/\r?\n/g, '\n'))
  const getOwner = async id => (await db.query('select * from public.vehicle_owners where id=$1', [id])).rows[0]
  assert.equal((await db.query('select state from public.vehicle_documents where id=$1', [legacyFile])).rows[0].state, 'ready')
  await db.exec('set role authenticated')
  for (let attempt=0;attempt<2;attempt++) {
    const old = await getOwner(legacy)
    await call('save_owner_record', [legacy, uid(), ownerFormPayload(ownerFormFromRow(old)), old.updated_at])
    const saved = await getOwner(legacy)
    for (const key of ['full_name','phone','national_id','notes','province','address']) assert.equal(saved[key], oldData[key], key)
  }
  const payload = ownerFormPayload({ ...ownerFormFromRow(null), first_name: 'Ahmad', surname: 'Ahmadi', father_name: 'Father', phone: '0700000001', province: 'Kabul', district: 'District', village: 'Village', notes: 'New notes' })
  const request = uid()
  const owner = await call('save_owner_record', [null, request, payload, null])
  assert.equal(await call('save_owner_record', [null, request, payload, null]), owner)
  let saved = await getOwner(owner)
  for (const key of ['full_name','first_name','surname','father_name','phone','province','district','village','address','notes']) assert.equal(saved[key], payload[key], key)
  const editPayload = ownerFormPayload({ ...ownerFormFromRow(saved), surname: 'Changed', district: 'New district' })
  const editRequest = uid()
  await call('save_owner_record', [owner, editRequest, editPayload, saved.updated_at])
  assert.equal(await call('save_owner_record', [owner, editRequest, editPayload, saved.updated_at]), owner)
  saved = await getOwner(owner)
  assert.equal(saved.full_name, 'Ahmad Changed')
  assert.equal(saved.address, 'Kabul، New district، Village')
  assert.equal(saved.notes, 'New notes')
  for (const type of ['profile_photo','identity']) {
    const id = uid(), photo = type === 'profile_photo'
    const path = await call('reserve_fleet_document', [id, 'owner', owner, type, photo ? 'person.jpg' : 'tazkira.pdf', photo ? 'image/jpeg' : 'application/pdf', 100, null])
    await db.query("insert into storage.objects(bucket_id,name) values('fleet-documents',$1)", [path])
    await call('complete_fleet_document', [id])
  }
  await assert.rejects(call('reserve_fleet_document', [uid(), 'owner', owner, 'profile_photo', 'bad.pdf', 'application/pdf', 100, null]), /INVALID_FILE/)
  const branch = await call('save_branch_record', [null, uid(), { name: 'Branch', province: 'Kabul', city: 'District' }, null, null])
  await db.exec('reset role')
  await db.query("update public.profiles set role='branch_manager',branch_id=$1 where id=$2", [branch, manager])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [manager])
  await db.exec('set role authenticated')
  const branchOwner = await call('save_owner_record', [null, uid(), { ...payload, phone: '0700000002', branch_id: branch }, null])
  assert.equal((await getOwner(branchOwner)).branch_id, branch)
  await assert.rejects(call('save_owner_record', [owner, uid(), editPayload, saved.updated_at]), /ACCESS_DENIED/)
  await assert.rejects(call('reserve_fleet_document', [uid(), 'owner', owner, 'identity', 'forged.pdf', 'application/pdf', 100, null]), /ACCESS_DENIED/)
  const ownDoc = await call('reserve_fleet_document', [uid(), 'owner', branchOwner, 'identity', 'branch-tazkira.pdf', 'application/pdf', 100, null])
  assert.ok(ownDoc)
  await db.exec('reset role; set role anon')
  await assert.rejects(call('save_owner_record', [null, uid(), payload, null]), /permission denied/)
  console.log('Owner form database checks passed: migration reruns safely, names/address and notes save, old addresses/IDs/documents persist, paired upload categories work, retries and branch access remain protected.')
} catch (error) {
  console.error({ message: error.message, code: error.code, where: error.where })
  process.exitCode = 1
} finally { await db.close() }
