// Disposable PostgreSQL verification against the full ordered migration history.
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
const {PGlite}=await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH||process.env.CASHBOOK_PGLITE_PATH).href)
const db=new PGlite()
const president='00000000-0000-0000-0000-000000000001',manager='00000000-0000-0000-0000-000000000002',driverUser='00000000-0000-0000-0000-000000000003'
const uid=()=>crypto.randomUUID()
async function call(name,args){return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args.map(a=>typeof a==='object'&&a!==null?JSON.stringify(a):a))).rows[0].result}
async function row(table,id){return(await db.query(`select * from public.${table} where id=$1`,[id])).rows[0]}
await db.exec(`create schema auth;create schema storage;create role anon;create role authenticated;create role service_role bypassrls;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',unique(bucket_id,name));
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;grant select on storage.buckets to authenticated;`)
for(const name of(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
 try{await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'))}catch(e){throw new Error(`${name}: ${e.message}`,{cause:e})}
}
await db.query('insert into auth.users(id) values($1),($2),($3)',[president,manager,driverUser])
await db.query("update public.profiles set role='president' where id=$1",[president])
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[president]);await db.exec('set role authenticated')
const branchData={name:'Kabul',province:'Kabul',city:'Kabul'}
const branch=await call('save_branch_record',[null,uid(),branchData,null,null])
const ownerData={full_name:'Owner',phone:'0700000001',branch_id:null}
const owner=await call('save_fleet_record',['owner',null,uid(),ownerData,null])
const vehicleData={owner_id:owner,plate_number:'ABC 123',vehicle_type:'Truck',capacity_tons:10,volume_capacity_m3:20,permit_expiry:'2099-12-31',status:'available',branch_id:null}
const vehicle=await call('save_fleet_record',['vehicle',null,uid(),vehicleData,null])
const driverData={full_name:'Driver',phone:'0700000002',license_expiry:'2099-12-31',status:'available',branch_id:null}
const driver=await call('save_fleet_record',['driver',null,uid(),driverData,null])
const traderData={first_name:'Trader',last_name:'One',phone:'0700000003',address:'Kabul'}
const traderRequest=uid(),trader=await call('save_trader_record',[null,traderRequest,traderData,null])
assert.equal(await call('save_trader_record',[null,traderRequest,traderData,null]),trader)
await assert.rejects(call('save_trader_record',[null,uid(),traderData,null]),/DUPLICATE_RECORD/)
const bookingData={booking_date:'2026-11-02',departure_date:'2026-11-03',arrival_date:'2026-11-04',branch_id:null,vehicle_id:vehicle,driver_id:driver,trader_id:trader,trader_first_name:'Trader',trader_last_name:'One',trader_phone:'0700000003',trader_address:'Kabul',sender_name:'Sender',sender_phone:'0700000004',sender_address:'Kabul',receiver_name:'Receiver',receiver_phone:'0700000005',receiver_address:'Herat',origin:'Kabul',destination:'Herat',goods:'Food',weight_tons:5,volume_m3:10,service_type:'arrangement',sender_is_trader:false}
const bookingRequest=uid(),booking=await call('save_booking_record',[null,bookingRequest,bookingData,null])
assert.equal(await call('save_booking_record',[null,bookingRequest,bookingData,null]),booking,'idempotent booking retry')
await assert.rejects(call('save_booking_record',[null,uid(),{...bookingData,weight_tons:11},null]),/CAPACITY_EXCEEDED/)
await assert.rejects(call('save_booking_record',[null,uid(),{...bookingData,volume_m3:21},null]),/CAPACITY_EXCEEDED/)
await assert.rejects(call('save_booking_record',[null,uid(),bookingData,null]),/RESOURCE_CONFLICT/)
let v=await row('vehicles',vehicle)
await assert.rejects(call('save_fleet_record',['vehicle',vehicle,uid(),{...v,status:'under_repair'},v.updated_at]),/RECORD_IN_USE/)
let tr=await row('traders',trader)
await call('save_trader_record',[trader,uid(),{...traderData,first_name:'Changed'},tr.updated_at])
const snapshot=(await db.query('select trader_first_name from public.bookings where id=$1',[booking])).rows[0]
assert.equal(snapshot.trader_first_name,'Trader','master edits must not rewrite booking snapshots')
let b=(await db.query('select id,updated_at,status from public.bookings where id=$1',[booking])).rows[0]
await call('save_booking_record',[booking,uid(),{...bookingData,goods:'Rice'},b.updated_at])
await assert.rejects(call('save_booking_record',[booking,uid(),{...bookingData,goods:'Stale'},b.updated_at]),/STALE_RECORD/)
b=(await db.query('select id,updated_at,status from public.bookings where id=$1',[booking])).rows[0]
await call('change_booking_status',[booking,'in_transit',uid(),b.updated_at])
b=(await db.query('select id,updated_at,status from public.bookings where id=$1',[booking])).rows[0]
await assert.rejects(call('archive_booking_record',[booking,true,b.updated_at]),/RECORD_IN_USE/)
await call('change_booking_status',[booking,'completed',uid(),b.updated_at])
b=(await db.query('select id,updated_at,status from public.bookings where id=$1',[booking])).rows[0]
await call('archive_booking_record',[booking,true,b.updated_at])
b=(await db.query('select id,updated_at,status from public.bookings where id=$1',[booking])).rows[0]
await call('archive_booking_record',[booking,false,b.updated_at])
const doc=uid(),path=await call('reserve_fleet_document',[doc,'driver',driver,'identity','id.pdf','application/pdf',100,null])
await assert.rejects(call('complete_fleet_document',[doc]),/INVALID_FILE/)
await db.query("insert into storage.objects(bucket_id,name) values('fleet-documents',$1)",[path]);await call('complete_fleet_document',[doc])
assert.equal((await row('vehicle_documents',doc)).state,'ready')
await call('set_fleet_document_expiry',[doc,'2026-12-31']);await call('remove_fleet_document',[doc,false])
await assert.rejects(call('remove_fleet_document',[doc,true]),/RECORD_IN_USE/)
await db.query("delete from storage.objects where bucket_id='fleet-documents' and name=$1",[path]);await call('remove_fleet_document',[doc,true])
assert.equal(await row('vehicle_documents',doc),undefined)
await db.exec('reset role')
await db.query("update public.profiles set role='branch_manager',branch_id=$1 where id=$2",[branch,manager])
await db.query('update public.branches set manager_user_id=$1 where id=$2',[manager,branch])
await db.exec('set role authenticated');await call('set_account_enabled',['branch',branch,false])
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[manager])
await assert.rejects(call('save_fleet_record',['driver',null,uid(),driverData,null]),/ACCESS_DENIED/)
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[president]);await call('set_account_enabled',['branch',branch,true])
const authRequest=uid()
await db.exec('reset role')
await db.query("update auth.users set raw_app_meta_data=$1 where id=$2",[JSON.stringify({pedram_driver_request:authRequest,pedram_driver_actor:president,pedram_driver_id:driver}),driverUser])
await db.exec('set role service_role')
await call('link_driver_account',[president,driver,driverUser,authRequest,'driver-one'])
await db.exec('reset role')
assert.equal((await row('drivers',driver)).user_id,driverUser)
assert.equal((await row('profiles',driverUser)).role,'driver')
await db.exec('set role authenticated');await call('set_account_enabled',['driver',driver,false])
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[driverUser])
assert.equal((await db.query('select id from public.drivers')).rows.length,0,'disabled driver cannot read fleet')
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[president]);await call('set_account_enabled',['driver',driver,true])
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[driverUser])
assert.equal((await db.query('select id,goods from public.bookings')).rows.length,1,'enabled driver sees assigned booking')
await assert.rejects(db.query('select commission from public.bookings'),/permission denied/,'driver cannot read financial fields')
await assert.rejects(db.query("update public.drivers set full_name='Changed by driver' where id=$1",[driver]),/permission denied/)
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[president])
let d=await row('drivers',driver)
await call('save_fleet_record',['driver',driver,uid(),{...d,license_expiry:'2026-11-02'},d.updated_at])
await assert.rejects(call('save_booking_record',[null,uid(),bookingData,null]),/DOCUMENT_EXPIRED/)
d=await row('drivers',driver);await call('save_fleet_record',['driver',driver,uid(),{...d,license_expiry:'2099-12-31'},d.updated_at])
v=await row('vehicles',vehicle)
await assert.rejects(call('save_fleet_record',['vehicle',vehicle,uid(),{...v,volume_capacity_m3:'NaN'},v.updated_at]),/INVALID_CAPACITY/)
await call('save_fleet_record',['vehicle',vehicle,uid(),{...v,archived:true},v.updated_at])
v=await row('vehicles',vehicle);assert.ok(v.archived_at)
await call('save_fleet_record',['vehicle',vehicle,uid(),{...v,archived:false},v.updated_at])
assert.equal((await row('vehicles',vehicle)).archived_at,null)
await assert.rejects(call('reserve_fleet_document',[uid(),'vehicle',vehicle,'photos','bad.exe','application/octet-stream',100,null]),/INVALID_FILE/)
const branchRow=await row('branches',branch)
await call('save_branch_record',[branch,uid(),{...branchRow,archived:true},branchRow.updated_at,null])
assert.equal((await row('profiles',manager)).account_enabled,false)
const deletedBranch=await row('branches',branch)
await call('save_branch_record',[branch,uid(),{...deletedBranch,archived:false,manager_enabled:false},deletedBranch.updated_at,null])
assert.equal((await row('branches',branch)).archived_at,null)
await call('cashbook_simple_post',[uid(),{branch_id:null,currency:'AFN',direction:'in',amount:'50',date:'2026-01-01',description:'Existing simple ledger still works'}])
await assert.rejects(db.query('select * from pedram_private.requests'),/permission denied/)
await db.exec('reset role')
const newManager=uid(),branchRequest=uid()
await db.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[newManager,'manager@example.test',JSON.stringify({pedram_provisioning_request:branchRequest,pedram_provisioning_actor:president})])
await db.exec('set role service_role')
assert.equal(await call('find_branch_provisioning_account',[president,branchRequest,'manager@example.test']),newManager)
const newBranchData={name:'Herat',province:'Herat',city:'Herat',manager_name:'Manager',manager_phone:'0700000006'}
const newBranch=await call('provision_branch',[president,branchRequest,newManager,newBranchData,'herat-manager',null,null])
assert.equal(await call('provision_branch',[president,branchRequest,newManager,newBranchData,'herat-manager',null,null]),newBranch)
await db.exec('reset role')
assert.equal((await row('profiles',newManager)).branch_id,newBranch)
console.log('Record workflows passed: real migrations, create/edit/archive/restore, trader duplicates, booking retries/conflicts/capacity/status/stale edits, document recovery/deletion, disabled manager and linked driver account.')
await db.close()
