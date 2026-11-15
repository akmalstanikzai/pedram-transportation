// Disposable local PostgreSQL only; no connection to hosted Supabase.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
if (!process.env.PEDRAM_PGLITE_PATH) throw Error('PEDRAM_PGLITE_PATH is required')
const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
try {
  await db.exec(`create schema storage; create role anon; create role authenticated;
    create function public.is_president_user() returns boolean language sql stable as $$ select current_setting('test.president', true) = 'yes' $$;
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;`)
  await db.exec(await readFile(new URL('../supabase/migrations/202611120001_employees.sql',import.meta.url),'utf8'))
  const employee = crypto.randomUUID(), file = crypto.randomUUID()
  await db.query("insert into public.employees(id,first_name,last_name,phone,province,district,village,salary) values($1,'First','Last','0700000000','Kabul','District','Village',10000)",[employee])
  await db.exec(await readFile(new URL('../supabase/migrations/202611150001_employee_details_and_files.sql',import.meta.url),'utf8'))
  assert.equal((await db.query('select father_name from public.employees')).rows[0].father_name,'')
  assert.equal((await db.query("select public from storage.buckets where id='employee-files'")).rows[0].public,false)
  await db.exec("set role authenticated; select set_config('test.president','yes',false)")
  await db.query('update public.employees set father_name=$1 where id=$2',['Father',employee])
  const reserve = async (id = file, type = 'photo', name = 'portrait.jpg', mime = 'image/jpeg', size = 100) => (await db.query('select public.reserve_employee_file($1,$2,$3,$4,$5,$6) as path',[id,employee,type,name,mime,size])).rows[0].path
  const path = await reserve()
  assert.equal(await reserve(), path)
  await assert.rejects(reserve(file,'photo','different.jpg'), /REQUEST_CONFLICT/)
  await assert.rejects(reserve(crypto.randomUUID(),'photo','id.pdf','application/pdf'), /INVALID_FILE/)
  await assert.rejects(reserve(crypto.randomUUID(),'identity','id.pdf','application/pdf',5242881), /INVALID_FILE/)
  await assert.rejects(db.query('select public.complete_employee_file($1)',[file]), /INVALID_FILE/)
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('employee-files','unreserved')"), /row-level security/)
  await db.query("insert into storage.objects(bucket_id,name) values('employee-files',$1)",[path])
  await db.query('select public.complete_employee_file($1)',[file])
  await db.query('select public.complete_employee_file($1)',[file])
  assert.equal((await db.query('select state from public.employee_files')).rows[0].state,'ready')
  await db.exec("select set_config('test.president','no',false)")
  assert.equal((await db.query('select * from public.employee_files')).rows.length,0)
  assert.equal((await db.query("select * from storage.objects where bucket_id='employee-files'")).rows.length,0)
  await assert.rejects(reserve(crypto.randomUUID()), /ACCESS_DENIED/)
  await assert.rejects(db.query('select public.complete_employee_file($1)',[file]), /ACCESS_DENIED/)
  // Restrictive guards also protect files when a different storage policy is broad.
  await db.exec('reset role; create policy broad_read on storage.objects for select to authenticated using(true); create policy broad_insert on storage.objects for insert to authenticated with check(true); create policy broad_update on storage.objects for update to authenticated using(true) with check(true); create policy broad_delete on storage.objects for delete to authenticated using(true); set role authenticated;')
  assert.equal((await db.query('select * from storage.objects')).rows.length,0)
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('employee-files','bypass')"), /row-level security/)
  await db.exec("select set_config('test.president','yes',false)")
  assert.equal((await db.query("delete from storage.objects where bucket_id='employee-files' returning id")).rows.length,0)
  assert.equal((await db.query("update storage.objects set name='changed' where bucket_id='employee-files' returning id")).rows.length,0)
  console.log('Employee migration, legacy data, upload validation, retries and president-only file access passed.')
} finally { await db.close() }
