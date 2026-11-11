// Runs against disposable PostgreSQL only; never connects to hosted Supabase.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { initialBranchForm, branchFormPayload } from '../src/lib/branchForm.js'
if (!process.env.PEDRAM_PGLITE_PATH) throw new Error('PEDRAM_PGLITE_PATH is required')
const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
const uid = () => crypto.randomUUID()
const president = uid(), oldManager = uid(), newManager = uid()
const call = async (name,args) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`, args.map(value=>typeof value==='object'&&value!==null?JSON.stringify(value):value))).rows[0].result
await db.exec(`create schema auth;create schema storage;create role anon;create role authenticated;create role service_role bypassrls;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',unique(bucket_id,name));
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;grant select on storage.buckets to authenticated;`)
try {
  for (const name of (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('.sql') && name < '202611110001').sort()) {
    try { await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')) }
    catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }) }
  }
  await db.query('insert into auth.users(id) values($1),($2),($3)', [president, oldManager, newManager])
  await db.query("update public.profiles set role='president' where id=$1", [president])
  await db.query("update public.profiles set role='branch_manager' where id=$1", [oldManager])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [president])
  await db.exec('set role authenticated')
  const legacy = await call('save_branch_record', [null, uid(), { name: 'Legacy', province: 'Kabul', city: 'District', phone: 'old-phone', manager_name: 'Original Full Name', national_id: 'original-id', manager_address: 'Original address' }, null, oldManager])
  const legacyFile = uid()
  const legacyPath = await call('reserve_branch_manager_file', [legacyFile, legacy, 'doc1', 'original.pdf', 'application/pdf', 100])
  await db.query("insert into storage.objects(bucket_id,name) values('branch-manager-files',$1)", [legacyPath])
  await call('complete_branch_manager_file', [legacyFile])
  await db.exec('reset role')
  await db.exec(await readFile(new URL('../supabase/migrations/202611110001_branch_form_details.sql', import.meta.url), 'utf8'))
  assert.equal((await db.query('select national_id from public.profiles where id=$1', [oldManager])).rows[0].national_id, 'original-id')
  assert.equal((await db.query('select state from public.branch_manager_files where id=$1', [legacyFile])).rows[0].state, 'ready')

  const form = { ...initialBranchForm, name: 'New branch', code: 'KBL-01', province: 'Kabul', city: 'District 2', address: 'Location', managerName: 'Ahmad', managerSurname: 'Ahmadi', managerPhone: '0700000000', fatherName: 'Father', homeProvince: 'Bamyan', homeDistrict: 'Yakawlang', homeVillage: 'Village' }
  const payload = branchFormPayload(form), request = uid()
  await db.exec('set role service_role')
  const branch = await call('provision_branch', [president, request, newManager, payload, 'branch_test'])
  assert.equal(await call('provision_branch', [president, request, newManager, payload, 'branch_test']), branch)
  await db.exec('reset role')
  const record = (await db.query('select * from public.branches where id=$1', [branch])).rows[0]
  const manager = (await db.query('select * from public.profiles where id=$1', [newManager])).rows[0]
  assert.equal(record.code, 'KBL-01')
  assert.equal(manager.full_name, 'Ahmad Ahmadi')
  assert.equal(manager.first_name, 'Ahmad')
  assert.equal(manager.surname, 'Ahmadi')
  assert.equal(manager.home_province, 'Bamyan')
  assert.equal(manager.home_district, 'Yakawlang')
  assert.equal(manager.home_village, 'Village')
  assert.equal(manager.phone, form.managerPhone)
  await db.exec('set role authenticated')
  const edit = { ...payload, code: 'KBL-02', manager_surname: 'Changed', manager_name: 'Ahmad Changed', manager_user_id: newManager }
  const editRequest = uid()
  await call('save_branch_record', [branch, editRequest, edit, record.updated_at])
  assert.equal(await call('save_branch_record', [branch, editRequest, edit, record.updated_at]), branch)
  for (const type of ['photo', 'identity', 'cv', 'education', 'contract', 'extra']) {
    const id = uid(), ext = type === 'photo' ? 'jpg' : 'pdf'
    const path = await call('reserve_branch_manager_file', [id, branch, type, `${type}.${ext}`, type === 'photo' ? 'image/jpeg' : 'application/pdf', 100])
    await db.query("insert into storage.objects(bucket_id,name) values('branch-manager-files',$1)", [path])
    await call('complete_branch_manager_file', [id])
  }
  await assert.rejects(call('reserve_branch_manager_file', [uid(), branch, 'photo', 'bad.pdf', 'application/pdf', 100]), /INVALID_FILE/)
  await assert.rejects(call('reserve_branch_manager_file', [uid(), branch, 'extra', 'large.pdf', 'application/pdf', 5242881]), /INVALID_FILE/)
  await db.exec('reset role')
  const updated = (await db.query('select * from public.branches where id=$1', [branch])).rows[0]
  assert.equal(updated.code, 'KBL-02')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [newManager])
  await db.exec('set role authenticated')
  await assert.rejects(call('save_branch_record', [branch, uid(), edit, updated.updated_at]), /ACCESS_DENIED/)
  await assert.rejects(call('reserve_branch_manager_file', [uid(), branch, 'extra', 'forged.pdf', 'application/pdf', 100]), /ACCESS_DENIED/)
  console.log('Branch form database checks passed: migration preserves old data/files, provisioning and edits save new fields, retries are safe, six document types work, upload limits and President-only access hold.')
} finally { await db.close() }
