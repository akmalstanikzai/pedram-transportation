// Disposable PostgreSQL check for the rollback migration; never connects to Supabase.
// Set PEDRAM_PGLITE_PATH to @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PEDRAM_PGLITE_PATH) throw new Error('PEDRAM_PGLITE_PATH is required')
const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
try {
  await db.exec(`
    create schema auth; create schema storage;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,delete on storage.objects to authenticated;
    grant select on storage.buckets to authenticated;
  `)
  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
    .filter((name) => name.endsWith('.sql')).sort()
  for (const name of migrations) {
    try {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
      if (name === '202611010004_workspace_tools.sql') {
        await db.exec(`
          insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001');
          update public.profiles set role='president' where id='00000000-0000-0000-0000-000000000001';
          insert into public.vehicle_owners(id,full_name,phone,created_by)
          values ('00000000-0000-0000-0000-000000000002','Existing owner','0700000000','00000000-0000-0000-0000-000000000001');
        `)
      }
    } catch (error) {
      throw new Error(`${name}: ${error.message}`, { cause: error })
    }
  }
  const { rows: [state] } = await db.query(`
    select
      has_table_privilege('authenticated','public.vehicles','INSERT') as fleet_write,
      has_table_privilege('authenticated','public.bookings','INSERT') as booking_write,
      has_sequence_privilege('authenticated','public.bookings_booking_number_seq','USAGE') as booking_sequence,
      to_regprocedure('public.save_fleet_record(text,uuid,uuid,jsonb,timestamptz)') is null as new_rpc_removed,
      to_regprocedure('public.workspace_alerts(integer)') is null as workspace_rpc_removed,
      pg_get_functiondef('public.create_booking_record(jsonb)'::regprocedure) like '%Select a vehicle and driver%' as old_booking_rpc,
      exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Management can upload fleet documents') as old_upload_policy,
      not exists(select 1 from pg_policies where schemaname='public' and policyname='vehicles_scope_guard') as new_guard_removed,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='status') as data_column_preserved
  `)
  for (const [name, value] of Object.entries(state)) assert.equal(value, true, name)
  const { rows: [preserved] } = await db.query(`
    select count(*)::integer as count from public.vehicle_owners
    where id='00000000-0000-0000-0000-000000000002'
  `)
  assert.equal(preserved.count, 1, 'existing owner preserved')
  await db.exec(`set role authenticated;
    select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`)
  const { rows: [inserted] } = await db.query(`
    insert into public.vehicle_owners(full_name,phone)
    values ('New owner after rollback','0700000001') returning id
  `)
  assert.ok(inserted.id, 'old direct fleet write restored')
  console.log(`Rollback migration passed after ${migrations.length} ordered migrations.`)
} finally {
  await db.close()
}
