// Disposable PostgreSQL check. Set PEDRAM_PGLITE_PATH to PGlite's dist/index.js.
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

if(!process.env.PEDRAM_PGLITE_PATH)throw new Error('PEDRAM_PGLITE_PATH is required')
const {PGlite}=await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db=new PGlite()
const president='00000000-0000-0000-0000-000000000001'
const manager='00000000-0000-0000-0000-000000000002'
const uid=()=>crypto.randomUUID()
const call=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args.map(value=>typeof value==='object'&&value!==null?JSON.stringify(value):value))).rows[0].result

await db.exec(`create schema auth;create schema storage;create role anon;create role authenticated;create role service_role bypassrls;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',unique(bucket_id,name));
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;grant select on storage.buckets to authenticated;`)
for(const name of(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(name=>name.endsWith('.sql')&&name<'202611090007').sort()){
 try{await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'))}catch(error){throw new Error(`${name}: ${error.message}`,{cause:error})}
}
await db.query('insert into auth.users(id) values($1),($2)',[president,manager])
await db.query("update public.profiles set role='president' where id=$1",[president])
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[president]);await db.exec('set role authenticated')
const branch=await call('save_branch_record',[null,uid(),{name:'Kabul',province:'Kabul',city:'Kabul'},null,null])
const owner=await call('save_fleet_record',['owner',null,uid(),{full_name:'Owner',phone:'0700000001'},null])
const vehicle=await call('save_fleet_record',['vehicle',null,uid(),{owner_id:owner,plate_number:'ABC 123',vehicle_type:'Truck',capacity_tons:10,volume_capacity_m3:20,permit_expiry:'2099-12-31',status:'available'},null])
const driver=await call('save_fleet_record',['driver',null,uid(),{full_name:'Driver',phone:'0700000002',license_expiry:'2099-12-31',status:'available'},null])
const trader=await call('save_trader_record',[null,uid(),{first_name:'Trader',last_name:'One',phone:'0700000003',address:'Kabul'},null])
const base={booking_date:'2026-11-02',branch_id:null,vehicle_id:vehicle,driver_id:driver,trader_id:trader,trader_first_name:'Trader',trader_last_name:'One',trader_phone:'0700000003',trader_address:'Kabul',sender_name:'Sender',sender_phone:'0700000004',sender_address:'Kabul',receiver_name:'Receiver',receiver_phone:'0700000005',receiver_address:'Herat',origin:'Kabul',destination:'Herat',goods:'Food',quantity_unit:'tons',quantity_amount:'5',service_type:'arrangement',commission_amount:'100.00',commission_currency:'AFN',freight_amount:'',carrier_cost:'',other_expenses:[],received_now:''}
const legacy=await call('save_booking_record',[null,uid(),{...base,booking_date:'2026-10-30',service_type:'managed',commission_amount:'10.00',freight_amount:'100.00',carrier_cost:'20.00',other_expenses:[{description:'Loading',amount:'5.50'}]},null])
assert.equal(Number((await db.query('select count(*) n from public.cashbook_entries')).rows[0].n),1,'old workflow wrote commission immediately')
await db.exec('reset role')
await db.exec(await readFile(new URL('../supabase/migrations/202611090007_booking_receivables.sql',import.meta.url),'utf8'))
await db.exec('set role authenticated')
let legacyFinance=await call('booking_finance_rows',[])
assert.equal(Number(legacyFinance.find(row=>row.id===legacy).charged),135.5,'migration adds all managed costs to legacy charge')
assert.equal(Number(legacyFinance.find(row=>row.id===legacy).paid),10,'migration preserves old cash entry')
const arrangementRequest=uid()
const arrangement=await call('save_booking_record',[null,arrangementRequest,base,null])
assert.equal(await call('save_booking_record',[null,arrangementRequest,base,null]),arrangement)
let finance=await call('booking_finance_rows',[])
assert.equal(Number(finance.find(row=>row.id===arrangement).charged),100)
assert.equal(Number(finance.find(row=>row.id===arrangement).paid),0)
assert.equal(Number((await db.query('select count(*) n from public.cashbook_entries')).rows[0].n),1,'unpaid commission must not enter cashbook')
await call('cashbook_simple_post',[uid(),{branch_id:null,currency:'AFN',direction:'in',amount:'40.00',date:'2026-11-02',description:'Partial payment',trader_id:trader,booking_id:arrangement}])
finance=await call('booking_finance_rows',[])
assert.equal(Number(finance.find(row=>row.id===arrangement).paid),40)
const managedData={...base,booking_date:'2026-11-04',branch_id:branch,service_type:'managed',commission_amount:'10.00',freight_amount:'100.00',carrier_cost:'20.00',other_expenses:[{description:'Loading',amount:'5.50'}],received_now:'35.50'}
const managedRequest=uid()
const managed=await call('save_booking_record',[null,managedRequest,managedData,null])
assert.equal(await call('save_booking_record',[null,managedRequest,managedData,null]),managed)
finance=await call('booking_finance_rows',[])
assert.equal(Number(finance.find(row=>row.id===managed).charged),135.5)
assert.equal(Number(finance.find(row=>row.id===managed).paid),35.5)
assert.equal(Number((await db.query('select count(*) n from public.cashbook_entries')).rows[0].n),3,'only actual receipts enter cashbook')
const statement=await call('trader_account_statement',[trader])
assert.equal(statement.charges.find(row=>row.booking_id===managed).amount,135.5)
await db.exec('reset role')
await db.query("update public.profiles set role='branch_manager',branch_id=$1 where id=$2",[branch,manager])
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[manager]);await db.exec('set role authenticated')
const branchStatement=await call('trader_account_statement',[trader])
assert.equal(branchStatement.charges.length,1,'manager sees only branch charges')
assert.equal(branchStatement.payments.length,1,'manager sees only branch payments')
await db.exec('reset role')
const traderUser=uid()
await db.query('insert into auth.users(id) values($1)',[traderUser])
await db.query("update public.profiles set role='trader' where id=$1",[traderUser])
await db.query('update public.traders set user_id=$1 where id=$2',[traderUser,trader])
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[traderUser]);await db.exec('set role authenticated')
const portal=await call('trader_portal_statement',[])
assert.equal(Number(portal.bookings.find(row=>row.id===managed).vehicle_cost),20)
assert.equal(Number(portal.bookings.find(row=>row.id===managed).other_expenses[0].amount),5.5)
console.log('Booking receivables passed: legacy backfill, unpaid debt, partial receipts, managed costs, retry safety, branch access, and trader cost details.')

await db.exec('reset role')
await db.exec(await readFile(new URL('../supabase/migrations/202611090008_operations_controls.sql',import.meta.url),'utf8'))
async function signIn(id) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
  await db.exec('set role authenticated')
}

await signIn(manager)
await assert.rejects(call('trader_account_statement',[trader]),/ACCESS_DENIED/)
await assert.rejects(call('save_trader_record',[trader,uid(),{},null]),/ACCESS_DENIED/)
await assert.rejects(call('add_trader_charge',[uid(),{}]),/ACCESS_DENIED/)
await assert.rejects(call('reverse_cashbook_entry',[uid(),'Mistake']),/ACCESS_DENIED/)
assert.equal((await db.query('select * from public.trader_charges')).rows.length,0)
assert.equal((await db.query('select * from public.cashbook_entries')).rows.length,0)
assert.equal((await db.query('select * from public.cashbook_operations')).rows.length,0)
const redacted = await call('branch_cashbook_rows',[])
assert.equal(redacted.length,1)
assert.equal(Number(redacted[0].amount),35.5)
assert.equal(redacted[0].description,null)
assert.equal(redacted[0].private_activity,true)
const branchFinance = await call('booking_finance_rows',[])
assert.equal(branchFinance.find(row=>row.id===managed).paid,undefined)
assert.equal((await call('operations_summary',[])).overdue,null)
const branchSchedule = await db.query("select public.fleet_schedule('2026-10-29', 14) as result")
assert.ok(branchSchedule.rows[0].result.jobs.some(row=>row.number==null && row.origin==null))
assert.ok(branchSchedule.rows[0].result.jobs.some(row=>row.number!=null && row.origin==='Kabul'))
await assert.rejects(call('cashbook_simple_post',[uid(),{
  branch_id:branch,currency:'AFN',direction:'in',amount:'1',date:'2026-11-02',description:'Payment',trader_id:trader,booking_id:managed,
}]),/ACCESS_DENIED/)
const branchBooking = {...base,branch_id:branch,booking_date:'2026-11-10'}
await assert.rejects(call('save_booking_record',[null,uid(),{...branchBooking,received_now:'1'},null]),/ACCESS_DENIED/)
assert.ok(await call('save_booking_record',[null,uid(),branchBooking,null]))

await signIn(president)
const paidAtBooking = await call('save_booking_record',[null,uid(),{...base,booking_date:'2026-11-12',received_now:'15.00'},null])
assert.equal(Number((await call('booking_finance_rows',[])).find(row=>row.id===paidAtBooking).paid),15)
const receipt=(await db.query('select operation_id from public.cashbook_entries where booking_id=$1',[managed])).rows[0].operation_id
await assert.rejects(call('reverse_cashbook_entry',[receipt,' ']),/REVERSAL_REASON_REQUIRED/)
const reversed=await call('reverse_cashbook_entry',[receipt,'Duplicate receipt'])
assert.equal(await call('reverse_cashbook_entry',[receipt,'Duplicate receipt']),reversed)
await assert.rejects(call('reverse_cashbook_entry',[reversed,'Reverse again']),/INVALID_REVERSAL/)
const paired=(await db.query('select direction,amount,description,trader_id,booking_id from public.cashbook_entries where operation_id in ($1,$2) order by direction',[receipt,reversed])).rows
assert.deepEqual(paired.map(row=>[row.direction,Number(row.amount),row.trader_id,row.booking_id]),[
  ['in',35.5,trader,managed],['out',35.5,trader,managed],
])
assert.match(paired[1].description,/Duplicate receipt/)
assert.equal(Number((await call('booking_finance_rows',[])).find(row=>row.id===managed).paid),0)
await db.exec('reset role')
await db.query("update public.bookings set status='in_transit' where id=$1",[managed])
await db.query("update public.vehicles set permit_expiry=(now() at time zone 'Asia/Kabul')::date+7 where id=$1",[vehicle])
const older = (await db.query("select ((now() at time zone 'Asia/Kabul')::date-31)::text as date")).rows[0].date
await signIn(president)
await call('add_trader_charge',[uid(),{trader_id:trader,branch_id:null,amount:'1000',description:'Older balance',date:older,currency:'AFN'}])
const overview = await call('operations_summary',[])
assert.equal(overview.active,1)
assert.equal(overview.expiring,1)
assert.equal(overview.overdue,1)
assert.ok(overview.cash.some(row=>row.currency==='AFN' && Number(row.incoming)>=15 && Number(row.outgoing)>=35.5))
await signIn(traderUser)
assert.equal((await call('trader_portal_statement',[])).payments.filter(row=>row.booking_id===managed).length,2)
await assert.rejects(call('operations_summary',[]),/ACCESS_DENIED/)
console.log('Operations controls passed: staff permissions, branch redaction, shared availability, reversal, and trader self-service.')

await db.exec('reset role')
await db.exec(await readFile(new URL('../supabase/migrations/202611090009_cashbook_amount_corrections.sql',import.meta.url),'utf8'))
await signIn(president)
const originalEntry = (await db.query(
  'select id,operation_id,entry_date,amount from public.cashbook_entries where booking_id=$1',[paidAtBooking],
)).rows[0]
const correctionRequest = uid()
const args = [correctionRequest,originalEntry.id,'15.00','21.25','Receipt checked']
await assert.rejects(call('correct_cashbook_amount',[uid(),originalEntry.id,'15','0','Invalid']),/INVALID_AMOUNT/)
await assert.rejects(call('correct_cashbook_amount',[uid(),originalEntry.id,'15','21.25',' ']),/CORRECTION_REASON_REQUIRED/)
assert.equal(await call('correct_cashbook_amount',args),correctionRequest)
assert.equal(await call('correct_cashbook_amount',args),correctionRequest)
await assert.rejects(call('correct_cashbook_amount',[uid(),originalEntry.id,'15','30','Stale']),/STALE_RECORD/)
const updatedEntries = (await db.query(
  'select id,operation_id,entry_date,amount from public.cashbook_entries where booking_id=$1',[paidAtBooking],
)).rows
assert.deepEqual(updatedEntries,[{...originalEntry,amount:'21.25'}])
assert.equal(Number((await call('booking_finance_rows',[])).find(row=>row.id===paidAtBooking).paid),21.25)
assert.deepEqual((await db.query(
  'select previous_amount,corrected_amount,reason from public.cashbook_amount_corrections where entry_id=$1',[originalEntry.id],
)).rows,[{previous_amount:'15.00',corrected_amount:'21.25',reason:'Receipt checked'}])
await signIn(manager)
await assert.rejects(call('correct_cashbook_amount',[uid(),originalEntry.id,'21.25','30','Forbidden']),/ACCESS_DENIED/)
assert.equal((await db.query('select * from public.cashbook_amount_corrections')).rows.length,0)
await signIn(president)
const updatedReversal = await call('reverse_cashbook_entry',[originalEntry.operation_id,'Receipt cancelled'])
assert.equal(Number((await db.query('select amount from public.cashbook_entries where operation_id=$1',[updatedReversal])).rows[0].amount),21.25)
await assert.rejects(call('correct_cashbook_amount',[uid(),originalEntry.id,'21.25','30','Already reversed']),/INVALID_CORRECTION/)
console.log('Amount corrections passed: preserved receipt and audit history, linked balance, retry and stale protection, permissions, and reversal.')

await db.exec('reset role')
await db.exec(await readFile(new URL('../supabase/migrations/202611090010_fleet_branch_scope.sql',import.meta.url),'utf8'))
await signIn(president)
const otherBranch=await call('save_branch_record',[null,uid(),{name:'Herat',province:'Herat',city:'Herat'},null,null])
const branchOwner=await call('save_fleet_record',['owner',null,uid(),{full_name:'Herat owner',phone:'0700000009',branch_id:otherBranch},null])
const branchVehicle=await call('save_fleet_record',['vehicle',null,uid(),{
  owner_id:branchOwner,plate_number:'HERAT321',vehicle_type:'Truck',capacity_tons:10,status:'available',branch_id:otherBranch,
},null])
const driverLogin=uid()
await db.exec('reset role')
await db.query('insert into auth.users(id) values($1)',[driverLogin])
await db.query('update public.profiles set branch_id=$1 where id=$2',[otherBranch,driverLogin])
await signIn(president)
const branchDriver=await call('save_fleet_record',['driver',null,uid(),{
  full_name:'Herat driver',phone:'0700000010',status:'available',branch_id:otherBranch,user_id:driverLogin,
},null])
const version=async (table,id)=>(await db.query(`select updated_at::text as stamp from public.${table} where id=$1`,[id])).rows[0]?.stamp
const vehicleStamp=await version('vehicles',branchVehicle)
const ownerStamp=await version('vehicle_owners',branchOwner)
const driverStamp=await version('drivers',branchDriver)
const newBooking={...base,booking_date:'2026-11-20',branch_id:otherBranch,vehicle_id:branchVehicle,driver_id:branchDriver}
await signIn(manager)
assert.equal(await version('vehicles',branchVehicle),undefined,'foreign branch vehicle is private')
assert.equal(await version('drivers',branchDriver),undefined,'foreign branch driver is private')
assert.ok(await version('vehicles',vehicle),'existing shared vehicles remain visible')
await assert.rejects(call('set_fleet_branch_scope',['vehicle',branchVehicle,branch,vehicleStamp]),/ACCESS_DENIED/)
await assert.rejects(call('save_booking_record',[null,uid(),newBooking,null]),/RESOURCE_UNAVAILABLE/)

await signIn(president)
await assert.rejects(call('set_fleet_branch_scope',['vehicle',branchVehicle,branch,vehicleStamp]),/OWNER_SCOPE_MISMATCH/)
await assert.rejects(call('set_fleet_branch_scope',['owner',branchOwner,branch,ownerStamp]),/OWNER_HAS_OTHER_FLEET/)
await call('set_fleet_branch_scope',['owner',branchOwner,null,ownerStamp])
await call('set_fleet_branch_scope',['vehicle',branchVehicle,branch,vehicleStamp])
await call('set_fleet_branch_scope',['driver',branchDriver,null,driverStamp])
assert.deepEqual((await db.query('select branch_id,account_enabled from public.profiles where id=$1',[driverLogin])).rows,[{branch_id:null,account_enabled:true}])
await signIn(manager)
assert.ok(await version('vehicle_owners',branchOwner))
assert.ok(await version('vehicles',branchVehicle))
assert.ok(await version('drivers',branchDriver))
const successfulBooking=await call('save_booking_record',[null,uid(),newBooking,null])
assert.equal((await db.query('select branch_id from public.bookings where id=$1',[successfulBooking])).rows[0].branch_id,branch)
await signIn(president)
await assert.rejects(call('set_fleet_branch_scope',['driver',branchDriver,otherBranch,await version('drivers',branchDriver)]),/RECORD_IN_USE/)
console.log('Fleet scope passed: branch isolation, owner eligibility, President-only assignment, branch booking, and active reservations.')
await db.close()
