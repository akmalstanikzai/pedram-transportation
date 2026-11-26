import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
const uid = () => crypto.randomUUID()
const [president, driverUser, otherUser, traderUser] = Array.from({ length: 4 }, uid)
const call = async (name, args = []) => (await db.query(
  `select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,
  args.map(value=>value && typeof value==='object' ? JSON.stringify(value) : value),
)).rows[0].result
const signIn = async id => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
  await db.exec('set role authenticated')
}
const save = (data, request = uid()) => call('save_booking_record',[null,request,data,null])
const finance = async id => (await call('booking_finance_rows')).find(row=>row.id===id)
const checkBalance = async (id, driver, charged, paid) => {
  const row = await finance(id)
  assert.equal(row.commission_driver_id,driver)
  assert.equal(Number(row.charged),charged)
  assert.equal(Number(row.paid),paid)
}

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
  const migration = '202611260001_driver_booking_commissions.sql'
  for (const file of (await readdir(migrations)).filter(name=>name.endsWith('.sql')&&name<migration).sort()) {
    try { await db.exec(await readFile(new URL(file,migrations),'utf8')) }
    catch (cause) { throw new Error(file+': '+cause.message,{cause}) }
  }
  await db.query('insert into auth.users(id) select unnest($1::uuid[])',[[president,driverUser,otherUser,traderUser]])
  await db.query("update public.profiles set role='president' where id=$1",[president])
  await db.query("update public.profiles set role='trader' where id=$1",[traderUser])
  const today = (await db.query("select ((now() at time zone 'Asia/Kabul')::date)::text date")).rows[0].date
  await signIn(president)
  const vehicle = await call('save_fleet_record',['vehicle',null,uid(),{plate_number:'KBL-100',vehicle_type:'Truck',capacity_tons:10},null])
  const secondVehicle = await call('save_fleet_record',['vehicle',null,uid(),{plate_number:'KBL-200',vehicle_type:'Truck',capacity_tons:10},null])
  const driver = await call('save_fleet_record',['driver',null,uid(),{full_name:'First Driver',phone:'0700000001',user_id:driverUser},null])
  const otherDriver = await call('save_fleet_record',['driver',null,uid(),{full_name:'Other Driver',phone:'0700000002',user_id:otherUser},null])
  const trader = await call('save_trader_record',[null,uid(),{first_name:'Trader',phone:'0700000003',address:'Kabul'},null])
  await db.exec('reset role')
  await db.query('update public.traders set user_id=$1 where id=$2',[traderUser,trader])
  await signIn(president)

  const base = {
    vehicle_id:vehicle, driver_id:driver,trader_id:trader,trader_first_name:'Trader',trader_phone:'0700000003',trader_address:'Kabul',
    origin:'Kabul',destination:'Herat',goods:'Food',quantity_unit:'tons',quantity_amount:'5',
    service_type:'arrangement',commission_amount:'100',commission_currency:'AFN',other_expenses:[],
  }
  const on = day => ({...base,booking_date:`2032-01-${day}`})
  const managedData = {
    ...on('03'),service_type:'managed',freight_amount:'500',carrier_cost:'100',
    sender_name:'Sender',sender_phone:'0700000001',sender_address:'Kabul',
    receiver_name:'Receiver',receiver_phone:'0700000002',receiver_address:'Herat',
  }
  const legacy = await save({...on('01'),received_now:'40'})
  const fullLegacy = await save({...on('02'),received_now:'100'})
  const unpaidLegacy = await save(on('05'))
  const managed = await save(managedData)
  const originalTraderReceipt = (await db.query('select operation_id from public.cashbook_entries where booking_id=$1',[legacy])).rows[0].operation_id
  await db.exec('reset role')
  await db.exec(await readFile(new URL(migration,migrations),'utf8'))
  await signIn(president)
  await checkBalance(legacy,driver,60,0)
  await checkBalance(fullLegacy,driver,0,0)
  await checkBalance(unpaidLegacy,driver,100,0)
  await checkBalance(managed,null,700,0)
  assert.equal((await db.query('select count(*)::int as total from public.cashbook_entries')).rows[0].total,2)
  assert.equal(Number((await db.query('select amount from public.trader_charges where booking_id=$1 and voided_at is null',[legacy])).rows[0].amount),40)

  const handoffDay = '2032-01-04'
  const freshData = {...on('04'),received_now:'20',handoff_date:handoffDay,handoff_location:'Transfer',onward_vehicle_id:secondVehicle,onward_driver_id:otherDriver}
  const bookRequest = uid()
  const fresh = await save(freshData,bookRequest)
  assert.equal(await save(freshData,bookRequest),fresh)
  await checkBalance(fresh,driver,100,20)
  assert.equal((await db.query('select id from public.trader_charges where booking_id=$1',[fresh])).rowCount,0)
  let transactions = await call('driver_cashbook_transactions',[driver])
  assert.ok(transactions.some(row=>row.direction==='in'&&Number(row.amount)===20))
  await assert.rejects(call('cashbook_simple_post',[uid(),{direction:'in',amount:10,date:today,currency:'AFN',description:'wrong payer',booking_id:fresh,trader_id:trader}]),/BOOKING_PAYMENT_UNAVAILABLE/)
  await assert.rejects(call('add_trader_charge',[uid(),{booking_id:fresh,trader_id:trader}]),/BOOKING_PAYMENT_UNAVAILABLE/)

  const receipt = uid()
  const receive = (booking, amount, request=uid(), payer=driver) => call('receive_driver_booking_commission',[request,booking,payer,amount,today])
  assert.equal(await receive(fresh,30,receipt),receipt)
  assert.equal(await receive(fresh,30,receipt),receipt)
  await assert.rejects(receive(fresh,31,receipt),/REQUEST_CONFLICT/)
  await assert.rejects(receive(fresh,51),/DRIVER_COMMISSION_EXCEEDS_BALANCE/)
  await assert.rejects(receive(fresh,10,uid(),otherDriver),/BOOKING_PAYMENT_UNAVAILABLE/)
  await checkBalance(fresh,driver,100,50)
  const entry=(await db.query('select id,trader_id,driver_id from public.cashbook_entries where operation_id=$1',[receipt])).rows[0]
  assert.equal(entry.driver_id,driver)
  assert.equal(entry.trader_id,null)
  await assert.rejects(call('correct_cashbook_amount',[uid(),entry.id,30,81,'Correction']),/DRIVER_COMMISSION_EXCEEDS_BALANCE/)
  await call('correct_cashbook_amount',[uid(),entry.id,30,40,'Correction'])
  await checkBalance(fresh,driver,100,60)
  await call('reverse_cashbook_entry',[receipt,'Refund correction'])
  await checkBalance(fresh,driver,100,20)
  const expected=(await db.query('select updated_at::text from public.bookings where id=$1',[fresh])).rows[0].updated_at
  await assert.rejects(call('save_booking_record',[fresh,uid(),{...on('04'),driver_id:otherDriver},expected]),/COMMISSION_DRIVER_LOCKED/)

  await call('reverse_cashbook_entry',[originalTraderReceipt,'Original trader payment reversed'])
  await checkBalance(legacy,driver,100,0)
  const traderHistory=await call('trader_account_statement',[trader])
  assert.equal(traderHistory.bookings.find(row=>row.id===fresh).driver_commission,true)
  assert.equal(traderHistory.charges.filter(row=>row.booking_id===legacy&&!row.voided_at).length,0)
  assert.equal(traderHistory.payments.filter(row=>row.booking_id===legacy).length,2)

  await db.exec('reset role')
  await db.exec(await readFile(new URL(migration,migrations),'utf8'))
  await signIn(president)
  await checkBalance(fresh,driver,100,20)
  await checkBalance(legacy,driver,100,0)
  assert.equal((await call('driver_booking_commissions',[driver])).length,4)

  await signIn(driverUser)
  assert.equal((await call('get_driver_portal')).bookings.find(row=>row.id===fresh).driver_commission.paid,20)
  await assert.rejects(receive(fresh,1),/ACCESS_DENIED/)
  await signIn(otherUser)
  assert.equal((await call('get_driver_portal')).bookings.find(row=>row.id===fresh).driver_commission,null)
  await assert.rejects(call('driver_booking_commissions',[driver]),/ACCESS_DENIED/)
  await signIn(traderUser)
  const portal=await call('trader_portal_statement')
  assert.equal(portal.bookings.find(row=>row.id===fresh).commission,null)
  assert.equal(portal.bookings.find(row=>row.id===managed).commission,100)
  assert.equal(portal.payments.filter(row=>row.booking_id===fresh).length,0)
  console.log('Driver commission migration, payments, corrections, reversals, statement and portal permissions passed.')
} catch(error) {
  console.error(error.message,error.code,error.where)
  process.exitCode=1
} finally {
  await db.close()
}
