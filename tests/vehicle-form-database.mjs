// Runs against disposable PostgreSQL only; never connects to hosted Supabase.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { capacityEntry, capacityFromEntry } from '../src/lib/capacity.js'
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
  for (const name of (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('.sql') && name < '202611110002').sort()) {
    try { await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')) }
    catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }) }
  }
  await db.query('insert into auth.users(id) values($1),($2)', [president, manager])
  await db.query("update public.profiles set role='president' where id=$1", [president])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [president])
  await db.exec('set role authenticated')
  const owner = await call('save_fleet_record', ['owner', null, uid(), { full_name: 'Shared owner', phone: '0700000000' }, null])
  const base = { plate_number: 'KBL 100', vehicle_type: 'Truck', status: 'available', branch_id: null, capacity_tons: '12.5', notes: 'Keep notes', color: 'White' }
  const legacy = await call('save_fleet_record', ['vehicle', null, uid(), { ...base, owner_id: owner, vin_number: 'ORIGINAL-VIN', model_year: '1400', permit_number: 'ORIGINAL-PERMIT', permit_expiry: '2099-12-31' }, null])
  await db.exec('reset role')
  const migration = await readFile(new URL('../supabase/migrations/202611110002_vehicle_form_details.sql', import.meta.url), 'utf8')
  const originalScope = (await db.query("select pg_get_functiondef('public.set_fleet_branch_scope(text,uuid,uuid,timestamptz)'::regprocedure) as definition")).rows[0].definition
  const reformattedScope = originalScope.replace(/\r?\n/g, '\r\n').replace(/  perform 1 from/g, '\tPERFORM   1   FROM').replace('o.id=owner_id', 'o.id = owner_id').replace('o.branch_id=p_branch', 'o.branch_id = p_branch')
  // SQL Editor / Windows copies can change CRLF, indentation and keyword case.
  for (const scopeDefinition of [originalScope, reformattedScope]) {
    for (const lineEnding of ['\n', '\r\n']) {
      await db.exec(scopeDefinition)
      await db.exec(migration.replace(/\r?\n/g, lineEnding))
    }
  }
  await db.exec(migration) // Safe to rerun against an already upgraded project.
  const getVehicle = async id => (await db.query('select * from public.vehicles where id=$1', [id])).rows[0]
  const old = await getVehicle(legacy)
  assert.equal(old.vin_number, 'ORIGINAL-VIN')
  assert.equal(old.model_year, '1400')
  assert.equal(old.permit_number, 'ORIGINAL-PERMIT')
  await db.exec('set role authenticated')
  const payload = { ...base, plate_number: 'KBL 200', owner_id: null, province: 'Kabul', model: 'FH16', capacity_tons: capacityFromEntry(capacityEntry('12.5')) }
  const request = uid()
  const vehicle = await call('save_fleet_record', ['vehicle', null, request, payload, null])
  assert.equal(await call('save_fleet_record', ['vehicle', null, request, payload, null]), vehicle)
  let saved = await getVehicle(vehicle)
  assert.equal(saved.owner_id, null)
  assert.equal(saved.province, 'Kabul')
  assert.equal(saved.model, 'FH16')
  assert.equal(Number(saved.capacity_tons), 12.5)
  await call('save_fleet_record', ['vehicle', legacy, uid(), { ...old, owner_id: '', model: 'Changed', province: 'Herat', capacity_tons: capacityFromEntry(capacityEntry(old.capacity_tons)) }, old.updated_at])
  const edited = await getVehicle(legacy)
  assert.equal(edited.owner_id, null)
  assert.equal(edited.vin_number, 'ORIGINAL-VIN')
  assert.equal(edited.model_year, '1400')
  assert.equal(edited.permit_number, 'ORIGINAL-PERMIT')
  assert.equal(edited.notes, 'Keep notes')
  const branch = await call('save_branch_record', [null, uid(), { name: 'Kabul branch', province: 'Kabul', city: 'District' }, null, null])
  const otherBranch = await call('save_branch_record', [null, uid(), { name: 'Herat branch', province: 'Herat', city: 'District' }, null, null])
  await call('set_fleet_branch_scope', ['vehicle', vehicle, branch, saved.updated_at])
  saved = await getVehicle(vehicle)
  assert.equal(saved.branch_id, branch)
  await call('set_fleet_branch_scope', ['vehicle', vehicle, null, saved.updated_at])
  const foreignOwner = await call('save_fleet_record', ['owner', null, uid(), { full_name: 'Other branch owner', phone: '0700000001', branch_id: otherBranch }, null])
  await assert.rejects(call('save_fleet_record', ['vehicle', null, uid(), { ...payload, plate_number: 'BAD 100', owner_id: foreignOwner, branch_id: branch }, null]), /RESOURCE_UNAVAILABLE/)
  const driver = await call('save_fleet_record', ['driver', null, uid(), { full_name: 'Driver', phone: '0700000002', license_expiry: '2099-12-31', status: 'available', branch_id: null }, null])
  const trader = await call('save_trader_record', [null, uid(), { first_name: 'Trader', last_name: 'One', phone: '0700000003', address: 'Kabul' }, null])
  const booking = { booking_date: '2026-11-11', branch_id: null, vehicle_id: vehicle, driver_id: driver, trader_id: trader, trader_first_name: 'Trader', trader_last_name: 'One', trader_phone: '0700000003', trader_address: 'Kabul', sender_name: 'Sender', sender_phone: '0700000004', sender_address: 'Kabul', receiver_name: 'Receiver', receiver_phone: '0700000005', receiver_address: 'Herat', origin: 'Kabul', destination: 'Herat', goods: 'Food', quantity_unit: 'tons', quantity_amount: '5', service_type: 'arrangement', commission_amount: '100.00', commission_currency: 'AFN', freight_amount: '', carrier_cost: '', other_expenses: [], received_now: '' }
  assert.ok(await call('save_booking_record', [null, uid(), booking, null]), 'ownerless vehicles remain bookable')
  await db.exec('reset role')
  await db.query("update public.profiles set role='branch_manager',branch_id=$1 where id=$2", [branch, manager])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [manager])
  await db.exec('set role authenticated')
  const branchVehicle = await call('save_fleet_record', ['vehicle', null, uid(), { ...payload, plate_number: 'BRANCH 100', branch_id: branch }, null])
  assert.equal((await getVehicle(branchVehicle)).branch_id, branch)
  await assert.rejects(call('save_fleet_record', ['vehicle', null, uid(), { ...payload, plate_number: 'BAD 200', branch_id: branch, owner_id: foreignOwner }, null]), /RESOURCE_UNAVAILABLE/)
  await assert.rejects(call('set_fleet_branch_scope', ['vehicle', branchVehicle, otherBranch, (await getVehicle(branchVehicle)).updated_at]), /ACCESS_DENIED/)
  console.log('Vehicle form database checks passed: migration reruns safely, ownerless create/edit/bookings work, province/model save, legacy values and capacities persist, branch permissions hold.')
} catch (error) {
  console.error({ message: error.message, code: error.code, where: error.where, stack: error.stack?.split('\n').slice(-4).join('\n') })
  process.exitCode = 1
} finally { await db.close() }
