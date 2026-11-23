import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
const uid = () => crypto.randomUUID()
const [president, manager, firstUser, secondUser, retiredVice, retiredManager] = Array.from({ length: 6 }, uid)
const call = async (name, args = []) => (await db.query(
  `select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,
  args.map(value=>value && !Array.isArray(value) && typeof value==='object' ? JSON.stringify(value) : value),
)).rows[0].result
const signIn = async id => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
  await db.exec('set role authenticated')
}
const row = async (table, id) => (await db.query(`select * from public.${table} where id=$1`,[id])).rows[0]
const version = async (table, id) => (await db.query(`select updated_at::text from public.${table} where id=$1`,[id])).rows[0].updated_at
const status = async (id, next, request = uid()) => call('change_booking_status',[id,next,request,await version('bookings',id)])
const save = (data, request = uid()) => call('save_booking_record',[null,request,data,null])
const jobs = async () => (await call('get_driver_portal')).bookings

try {
  await db.exec(`
    create schema auth; create schema storage; create role anon; create role authenticated; create role service_role bypassrls;
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
  const migrations = new URL('../supabase/migrations/',import.meta.url)
  for (const file of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()) {
    if (file.startsWith('202611230002')) {
      await db.query('insert into auth.users(id) select unnest($1::uuid[])',[[president,manager,firstUser,secondUser,retiredVice,retiredManager]])
      await db.query("update public.profiles set role='president' where id=$1",[president])
      await db.query("update public.profiles set role='vice_president' where id=$1",[retiredVice])
      await db.query("update public.profiles set role='departmental_manager' where id=$1",[retiredManager])
    }
    try { await db.exec(await readFile(new URL(file,migrations),'utf8')) }
    catch (cause) { throw new Error(file+': '+cause.message,{cause}) }
  }

  const roleNames = (await db.query("select unnest(enum_range(null::public.app_role))::text role")).rows.map(item=>item.role)
  assert.deepEqual(roleNames,['president','branch_manager','driver','trader'])
  for (const former of [retiredVice,retiredManager]) {
    assert.equal((await row('profiles',former)).account_enabled,false)
    await signIn(former)
    await assert.rejects(call('get_driver_portal'),/ACCESS_DENIED/)
    await assert.rejects(call('fleet_schedule',['2030-01-01',7]),/ACCESS_DENIED/)
    await db.exec('reset role')
  }

  const dateAt = async (days = 0) => (await db.query("select ((now() at time zone 'Asia/Kabul')::date + $1::integer)::text date",[days])).rows[0].date
  const [day,transfer,arrival] = await Promise.all([dateAt(),dateAt(2),dateAt(5)])
  await signIn(president)
  const branch = await call('save_branch_record',[null,uid(),{name:'Herat',province:'Herat',city:'Centre'},null,null])
  await db.exec('reset role')
  await db.query("update public.profiles set role='branch_manager',branch_id=$1 where id=$2",[branch,manager])
  await signIn(president)
  const firstVehicle = await call('save_fleet_record',['vehicle',null,uid(),{plate_number:'IR-500',vehicle_type:'Truck',capacity_tons:30},null])
  const secondVehicle = await call('save_fleet_record',['vehicle',null,uid(),{plate_number:'AF-900',vehicle_type:'Truck',capacity_tons:10},null])
  const firstDriver = await call('save_fleet_record',['driver',null,uid(),{full_name:'First Driver',phone:'0700000001',user_id:firstUser},null])
  const secondDriver = await call('save_fleet_record',['driver',null,uid(),{full_name:'Second Driver',phone:'0700000002',user_id:secondUser},null])
  const trader = await call('save_trader_record',[null,uid(),{first_name:'Trader',last_name:'One',phone:'0700000003',address:'Private trader address'},null])
  const base = {
    booking_date:day, departure_date:day, arrival_date:arrival, vehicle_id:firstVehicle, driver_id:firstDriver, trader_id:trader,
    trader_first_name:'Trader', trader_phone:'0700000003', trader_address:'Private trader address',
    sender_name:'Iranian sender',sender_address:'Load origin',sender_phone:'0700000004',
    receiver_name:'Afghan receiver',receiver_address:'Final unloading point',receiver_phone:'0700000005',
    origin:'Mashhad', destination:'Kabul', goods:'Food', quantity_unit:'tons', quantity_amount:'5',
    service_type:'managed', commission_amount:'100', commission_currency:'AFN', freight_amount:'200', carrier_cost:'300',
    other_expenses:[], received_now:'50',
  }
  const handoff = {...base,handoff_date:transfer,handoff_location:'Islam Qala',onward_vehicle_id:secondVehicle,onward_driver_id:secondDriver}
  await assert.rejects(save({...base,arrival_date:await dateAt(-1)}),/INVALID_DATES/)
  await assert.rejects(save({...handoff,handoff_date:await dateAt(6)}),/INVALID_HANDOFF/)
  await assert.rejects(save({...handoff,onward_driver_id:firstDriver}),/INVALID_HANDOFF/)
  await assert.rejects(save({...handoff,onward_vehicle_id:null}),/INVALID_HANDOFF/)
  await assert.rejects(save({...handoff,quantity_amount:'15'}),/CAPACITY_EXCEEDED/)
  const request = uid()
  const id = await save(handoff,request)
  assert.equal(await save(handoff,request),id)
  const statement = await call('trader_account_statement',[trader])
  assert.equal(statement.charges.filter(item=>item.booking_id===id).length,1)
  assert.equal(Number(statement.payments.find(item=>item.booking_id===id).amount),50)
  await assert.rejects(save({...base,departure_date:transfer,received_now:''}),/RESOURCE_CONFLICT/)
  await assert.rejects(save({...base,departure_date:transfer,vehicle_id:secondVehicle,driver_id:secondDriver,received_now:''}),/RESOURCE_CONFLICT/)
  const laterFirstLegTrip = await save({...base,departure_date:await dateAt(4),arrival_date:await dateAt(6),received_now:''})
  const primaryReservation = (await call('fleet_schedule',[day,7])).jobs.find(job=>job.resource_id===firstVehicle && job.destination==='Islam Qala')
  const onwardReservation = (await call('fleet_schedule',[day,7])).jobs.find(job=>job.resource_id===secondVehicle)
  assert.equal(primaryReservation.ends,transfer)
  assert.equal(onwardReservation.starts,transfer)
  const secondVehicleRow = await row('vehicles',secondVehicle)
  await assert.rejects(call('save_fleet_record',['vehicle',secondVehicle,uid(),{...secondVehicleRow,archived:true},
    await version('vehicles',secondVehicle)]),/RECORD_IN_USE/)
  await assert.rejects(call('set_fleet_branch_scope',['driver',secondDriver,branch,await version('drivers',secondDriver)]),/RECORD_IN_USE/)

  await signIn(manager)
  const branchSchedule = (await call('fleet_schedule',[day,7])).jobs.find(job=>job.resource_id===secondVehicle)
  assert.equal(branchSchedule.number,null)
  assert.equal(branchSchedule.origin,null)
  assert.equal((await db.query('select id from public.bookings where id=$1',[id])).rowCount,0)

  await signIn(firstUser)
  let firstJob = (await jobs()).find(job=>job.id===id)
  assert.equal(firstJob.leg,1)
  assert.equal(firstJob.destination,'Islam Qala')
  assert.equal(firstJob.receiver_phone,null)
  assert.equal(firstJob.sender_phone,'0700000004')
  assert.equal(firstJob.trader_phone,undefined)
  assert.equal((await db.query('select trader_phone,trader_address from public.bookings')).rowCount,0)
  await assert.rejects(call('driver_booking_action',[id,'accept',firstJob.updated_at,2]),/ACCESS_DENIED/)
  await call('driver_booking_action',[id,'accept',firstJob.updated_at,1])

  await signIn(secondUser)
  let secondJob = (await jobs()).find(job=>job.id===id)
  assert.equal(secondJob.leg,2)
  assert.equal(secondJob.origin,'Islam Qala')
  assert.equal(secondJob.sender_phone,null)
  assert.equal(secondJob.receiver_phone,'0700000005')
  assert.equal(secondJob.awaiting_handoff,true)
  await assert.rejects(call('driver_booking_action',[id,'delivered',secondJob.updated_at,2]),/INVALID_TRANSITION/)
  await call('driver_booking_action',[id,'accept',secondJob.updated_at,2])

  await signIn(president)
  await status(id,'in_transit')
  await assert.rejects(status(id,'completed'),/HANDOFF_REQUIRED/)

  await signIn(firstUser)
  firstJob = (await jobs()).find(job=>job.id===id)
  assert.ok(firstJob.driver_accepted_at)
  await call('driver_booking_action',[id,'delivered',firstJob.updated_at,1])
  await signIn(president)
  const transferRequest = uid()
  await status(id,'handoff',transferRequest)
  assert.equal(await status(id,'handoff',transferRequest),id)
  await db.exec('reset role')
  assert.equal((await db.query('select handoff_confirmed_by from public.bookings where id=$1',[id])).rows[0].handoff_confirmed_by,president)
  await signIn(president)
  assert.equal((await call('fleet_schedule',[day,7])).jobs.filter(job=>job.resource_id===firstVehicle && job.destination==='Islam Qala').length,0)
  await save({...base,arrival_date:day,received_now:''})

  await signIn(firstUser)
  assert.equal((await jobs()).find(job=>job.id===id).status,'completed')
  assert.ok((await jobs()).some(job=>job.id===laterFirstLegTrip))
  await signIn(secondUser)
  secondJob = (await jobs()).find(job=>job.id===id)
  assert.equal(secondJob.status,'in_transit')
  assert.ok(secondJob.driver_accepted_at)
  assert.equal(secondJob.driver_delivered_at,null)
  await call('driver_booking_action',[id,'delivered',secondJob.updated_at,2])
  await signIn(president)
  await status(id,'completed')
  await call('bulk_completed_bookings',[[id],'delete'])
  await signIn(firstUser)
  assert.equal((await jobs()).some(job=>job.id===id),false)
  await signIn(secondUser)
  assert.equal((await jobs()).some(job=>job.id===id),false)
  await assert.rejects(call('driver_booking_action',[id,'delivered',secondJob.updated_at,2]),/ACCESS_DENIED/)
  console.log('Role retirement, driver privacy, trip dates, leg reservations, handoff and one receivable passed.')
} finally {
  await db.close()
}
