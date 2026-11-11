// Runs against disposable PostgreSQL only; never connects to hosted Supabase.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { driverFormFromRow, driverFormPayload } from '../src/lib/driverForm.js'
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
  for (const name of (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('.sql') && name < '202611110003').sort()) {
    try { await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')) }
    catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }) }
  }
  await db.query('insert into auth.users(id) values($1),($2)', [president, manager])
  await db.query("update public.profiles set role='president' where id=$1", [president])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [president])
  await db.exec('set role authenticated')
  const oldData = { full_name: 'Legacy Driver Name', phone: '0700000000', national_id: 'original-id', license_number: 'original-license', previous_company: 'Original employer', address: 'Original address', license_expiry: '2099-12-31', status: 'available', branch_id: null }
  const legacy = await call('save_driver_employment', [null, uid(), oldData, null])
  const legacyFile = uid()
  const legacyPath = await call('reserve_fleet_document', [legacyFile, 'driver', legacy, 'contract', 'legacy-contract.pdf', 'application/pdf', 100, null])
  await db.query("insert into storage.objects(bucket_id,name) values('fleet-documents',$1)", [legacyPath])
  await call('complete_fleet_document', [legacyFile])
  await db.exec('reset role')
  const migration = await readFile(new URL('../supabase/migrations/202611110003_driver_form_details.sql', import.meta.url), 'utf8')
  await db.exec(migration.replace(/\r?\n/g, '\r\n'))
  await db.exec(migration.replace(/\r?\n/g, '\n'))
  const getDriver = async id => (await db.query('select * from public.drivers where id=$1', [id])).rows[0]
  const old = await getDriver(legacy)
  assert.equal((await db.query('select state from public.vehicle_documents where id=$1', [legacyFile])).rows[0].state, 'ready')
  await db.exec('set role authenticated')
  const unchangedLegacy = driverFormPayload(driverFormFromRow(old))
  await call('save_driver_employment', [legacy, uid(), unchangedLegacy, old.updated_at])
  const preserved = await getDriver(legacy)
  for (const key of ['full_name','national_id','license_number','previous_company','address','license_expiry']) assert.equal(String(preserved[key]), String(old[key]), key)
  const payload = driverFormPayload({ ...driverFormFromRow(null), first_name: 'Ahmad', surname: 'Ahmadi', father_name: 'Father', phone: '0700000001', phone_secondary: '0700000002', province: 'Kabul', district: 'District', village: 'Village' })
  const request = uid()
  const driver = await call('save_driver_employment', [null, request, payload, null])
  assert.equal(await call('save_driver_employment', [null, request, payload, null]), driver)
  let saved = await getDriver(driver)
  for (const key of ['full_name','first_name','surname','phone','phone_secondary','province','district','village','address']) assert.equal(saved[key], payload[key], key)
  const editForm = driverFormFromRow(saved)
  editForm.surname = 'Changed'
  editForm.phone_secondary = '0700000003'
  const editPayload = driverFormPayload(editForm), editRequest = uid()
  await call('save_driver_employment', [driver, editRequest, editPayload, saved.updated_at])
  assert.equal(await call('save_driver_employment', [driver, editRequest, editPayload, saved.updated_at]), driver)
  saved = await getDriver(driver)
  assert.equal(saved.full_name, 'Ahmad Changed')
  assert.equal(saved.phone_secondary, '0700000003')
  for (const type of ['profile_photo','identity','licence','passport','health','other']) {
    const id = uid(), photo = type === 'profile_photo'
    const path = await call('reserve_fleet_document', [id, 'driver', driver, type, photo ? 'photo.jpg' : `${type}.pdf`, photo ? 'image/jpeg' : 'application/pdf', 100, null])
    await db.query("insert into storage.objects(bucket_id,name) values('fleet-documents',$1)", [path])
    await call('complete_fleet_document', [id])
  }
  await assert.rejects(call('reserve_fleet_document', [uid(), 'driver', driver, 'profile_photo', 'bad.pdf', 'application/pdf', 100, null]), /INVALID_FILE/)
  await assert.rejects(call('reserve_fleet_document', [uid(), 'driver', driver, 'other', 'large.pdf', 'application/pdf', 5242881, null]), /INVALID_FILE/)
  const branch = await call('save_branch_record', [null, uid(), { name: 'Branch', province: 'Kabul', city: 'District' }, null, null])
  await db.exec('reset role')
  await db.query("update public.profiles set role='branch_manager',branch_id=$1 where id=$2", [branch, manager])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [manager])
  await db.exec('set role authenticated')
  const branchDriver = await call('save_driver_employment', [null, uid(), { ...payload, phone: '0700000004', branch_id: branch }, null])
  assert.equal((await getDriver(branchDriver)).branch_id, branch)
  await assert.rejects(call('save_driver_employment', [driver, uid(), editPayload, saved.updated_at]), /ACCESS_DENIED/)
  await assert.rejects(call('reserve_fleet_document', [uid(), 'driver', driver, 'other', 'forged.pdf', 'application/pdf', 100, null]), /ACCESS_DENIED/)
  const branchDoc = await call('reserve_fleet_document', [uid(), 'driver', branchDriver, 'other', 'branch.pdf', 'application/pdf', 100, null])
  assert.ok(branchDoc)
  console.log('Driver form database checks passed: migration reruns with Windows/Unix line endings; names, contacts and address save; six upload types work; legacy data/documents, retry safety and branch permissions remain intact.')
} catch (error) {
  console.error({ message: error.message, code: error.code, where: error.where })
  process.exitCode = 1
} finally { await db.close() }
