// Runs against disposable PostgreSQL only; never connects to hosted Supabase.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { vehicleWeightsFromRow, vehicleWeightsPayload } from '../src/lib/capacity.js'
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
  for (const name of (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('.sql') && name < '202611120001').sort()) {
    try { await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')) }
    catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }) }
  }
  await db.query('insert into auth.users(id) values($1),($2)', [president, manager])
  await db.query("update public.profiles set role='president' where id=$1", [president])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [president])
  await db.exec('set role authenticated')
  const base = { plate_number: 'OLD 100', vehicle_type: 'Truck', status: 'available', branch_id: null, capacity_tons: '12.5', notes: 'Original notes', vin_number: 'Original VIN', model_year: '1400', permit_number: 'Original permit' }
  const legacy = await call('save_fleet_record', ['vehicle',null,uid(),base,null])
  await db.exec('reset role')
  const migration = await readFile(new URL('../supabase/migrations/202611120001_vehicle_weights.sql', import.meta.url), 'utf8')
  await db.exec(migration.replace(/\r?\n/g,'\r\n'))
  await db.exec(migration.replace(/\r?\n/g,'\n'))
  const getVehicle = async id => (await db.query('select * from public.vehicles where id=$1',[id])).rows[0]
  await db.exec('set role authenticated')
  const old = await getVehicle(legacy)
  await call('save_vehicle_record',[legacy,uid(),{...old,...vehicleWeightsPayload(vehicleWeightsFromRow(old))},old.updated_at])
  const preserved = await getVehicle(legacy)
  for (const key of ['capacity_tons','notes','vin_number','model_year','permit_number']) assert.equal(String(preserved[key]),String(old[key]),key)
  const ownerRequest = uid()
  const ownerData = { full_name: 'New Owner', first_name: 'New', surname: 'Owner', phone: '0700000000', branch_id: null }
  const owner = await call('save_owner_record',[null,ownerRequest,ownerData,null])
  assert.equal(await call('save_owner_record',[null,ownerRequest,ownerData,null]),owner)
  const payload = { ...base, plate_number: 'NEW 100', owner_id: owner, ...vehicleWeightsPayload({gross:'53000.125',empty:'15000.025'}), capacity_tons: '999' }
  const request = uid()
  const vehicle = await call('save_vehicle_record',[null,request,payload,null])
  assert.equal(await call('save_vehicle_record',[null,request,payload,null]),vehicle)
  let saved = await getVehicle(vehicle)
  assert.equal(saved.owner_id,owner)
  assert.equal(Number(saved.gross_weight_kg),53000.125)
  assert.equal(Number(saved.empty_weight_kg),15000.025)
  assert.equal(Number(saved.capacity_tons),38.0001,'server must derive cargo capacity instead of trusting a supplied capacity')
  const requestEdit = uid()
  const edit = {...saved,gross_weight_kg:'50000',empty_weight_kg:'15000',capacity_tons:'999'}
  await call('save_vehicle_record',[vehicle,requestEdit,edit,saved.updated_at])
  assert.equal(await call('save_vehicle_record',[vehicle,requestEdit,edit,saved.updated_at]),vehicle)
  saved = await getVehicle(vehicle)
  assert.equal(Number(saved.capacity_tons),35)
  for (const [gross,empty] of [['100','200'],['1',''],['NaN','0'],['Infinity','0'],['1000000000','1'],['1.0001','0']]) {
    await assert.rejects(call('save_vehicle_record',[null,uid(),{...base,plate_number:uid(),gross_weight_kg:gross,empty_weight_kg:empty},null]),/INVALID_VEHICLE_WEIGHTS/)
  }
  const driver = await call('save_driver_employment',[null,uid(),{full_name:'Driver',phone:'0700000001',status:'available',license_expiry:'2099-12-31'},null])
  const trader = await call('save_trader_record',[null,uid(),{first_name:'Trader',last_name:'One',phone:'0700000002',address:'Kabul'},null])
  const booking = { booking_date:'2026-11-12',branch_id:null,vehicle_id:vehicle,driver_id:driver,trader_id:trader,trader_first_name:'Trader',trader_last_name:'One',trader_phone:'0700000002',trader_address:'Kabul',sender_name:'Sender',sender_phone:'0700000003',sender_address:'Kabul',receiver_name:'Receiver',receiver_phone:'0700000004',receiver_address:'Herat',origin:'Kabul',destination:'Herat',goods:'Food',quantity_unit:'tons',quantity_amount:'36',service_type:'arrangement',commission_amount:'100',commission_currency:'AFN',freight_amount:'',carrier_cost:'',other_expenses:[],received_now:'' }
  await assert.rejects(call('save_booking_record',[null,uid(),booking,null]),/CAPACITY_EXCEEDED/)
  assert.ok(await call('save_booking_record',[null,uid(),{...booking,quantity_amount:'34'},null]))
  await assert.rejects(call('save_vehicle_record',[vehicle,uid(),{...saved,gross_weight_kg:'20000',empty_weight_kg:'15000'},saved.updated_at]),/RECORD_IN_USE/)
  assert.equal(Number((await getVehicle(vehicle)).gross_weight_kg),50000,'failed capacity reduction must not change the stored weights')
  const branch = await call('save_branch_record',[null,uid(),{name:'Branch',province:'Kabul',city:'District'},null,null])
  await db.exec('reset role')
  await db.query("update public.profiles set role='branch_manager',branch_id=$1 where id=$2",[branch,manager])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[manager])
  await db.exec('set role authenticated')
  const branchOwner = await call('save_owner_record',[null,uid(),{...ownerData,phone:'0700000005',branch_id:branch},null])
  const branchVehicle = await call('save_vehicle_record',[null,uid(),{...payload,plate_number:'BRANCH 100',owner_id:branchOwner,branch_id:branch},null])
  assert.equal((await getVehicle(branchVehicle)).branch_id,branch)
  await assert.rejects(call('save_vehicle_record',[vehicle,uid(),{...saved,branch_id:null},saved.updated_at]),/ACCESS_DENIED/)
  console.log('Vehicle weights checks passed: independent decimal weights, server-derived cargo tons, legacy values, owner creation/selection, retry safety, booking limits and branch isolation.')
} catch(error) {
  console.error({message:error.message,code:error.code,where:error.where})
  process.exitCode=1
} finally { await db.close() }
