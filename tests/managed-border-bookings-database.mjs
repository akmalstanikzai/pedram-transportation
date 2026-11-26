import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
const uid = () => crypto.randomUUID()
const [president, manager, otherManager, traderUser, otherTraderUser, driverUser] = Array.from({length:6},uid)
const call = async (name, args = []) => (await db.query(
  `select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,
  args.map(value=>value && typeof value==='object' ? JSON.stringify(value) : value),
)).rows[0].result
async function signIn(id) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
  await db.exec('set role authenticated')
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
  for (const file of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()) {
    try { await db.exec(await readFile(new URL(file,migrations),'utf8')) }
    catch (cause) { throw new Error(file+': '+cause.message,{cause}) }
  }
  await db.query('insert into auth.users(id) select unnest($1::uuid[])',[[president,manager,otherManager,traderUser,otherTraderUser,driverUser]])
  await db.query("update public.profiles set role='president' where id=$1",[president])
  await db.query("update public.profiles set role='trader' where id in ($1,$2)",[traderUser,otherTraderUser])
  const today = (await db.query("select ((now() at time zone 'Asia/Kabul')::date)::text date")).rows[0].date

  await signIn(president)
  const branch = await call('save_branch_record',[null,uid(),{name:'Border branch',province:'Herat',city:'Herat'},null,null])
  const otherBranch = await call('save_branch_record',[null,uid(),{name:'Other branch',province:'Kabul',city:'Kabul'},null,null])
  const vehicle = await call('save_fleet_record',['vehicle',null,uid(),{plate_number:'KBL-301',vehicle_type:'Truck',capacity_tons:10},null])
  const driver = await call('save_fleet_record',['driver',null,uid(),{full_name:'Afghan Driver',phone:'0700000041',user_id:driverUser},null])
  const trader = await call('save_trader_record',[null,uid(),{first_name:'Trader',phone:'0700000043',address:'Kabul'},null])
  const otherTrader = await call('save_trader_record',[null,uid(),{first_name:'Other trader',phone:'0700000044',address:'Kabul'},null])
  await db.exec('reset role')
  await db.query("update public.profiles set role='branch_manager',branch_id=$1 where id=$2",[branch,manager])
  await db.query("update public.profiles set role='branch_manager',branch_id=$1 where id=$2",[otherBranch,otherManager])
  await db.query('update public.traders set user_id=$1 where id=$2',[traderUser,trader])
  await db.query('update public.traders set user_id=$1 where id=$2',[otherTraderUser,otherTrader])

  const charges = [
    {key:'foreign_freight',amount:'300',currency:'USD'},
    {key:'customs',amount:'5000',currency:'AFN'},
    {key:'afghan_freight',amount:'8000',currency:'AFN'},
    {key:'commission',amount:'2000.25',currency:'AFN'},
    {key:'terminal',amount:'100',currency:'AFN'},
    {key:'labour',amount:'50',currency:'AFN'},
    {key:'other:'+uid(),amount:'20.50',currency:'USD',description:'Loading fee'},
  ]
  const payload = {
    booking_date:today,branch_id:branch,trader_id:trader,trader_first_name:'Trader',trader_phone:'0700000043',trader_address:'Kabul',
    sender_name:'Sender',sender_phone:'0700000045',sender_address:'Origin',
    receiver_name:'Receiver',receiver_phone:'0700000046',receiver_address:'Destination',
    vehicle_id:vehicle,driver_id:driver,origin:'Iran',destination:'Kabul',goods:'Food',quantity_unit:'tons',quantity_amount:'5',service_type:'managed',
    managed_border:{border_location:'Islam Qala',foreign_plate:'Foreign plate',foreign_driver:'Foreign name',foreign_mobile:'0700000047',afghan_waybill:'WB-1'},
    managed_charges:charges,
  }
  const save = (data, request=uid(), id=null, stamp=null) => call('save_booking_record',[id,request,data,stamp])
  const finance = async booking => (await call('booking_finance_rows')).find(row=>row.id===booking)?.managed_transport
  const request = uid()
  await signIn(manager)
  await assert.rejects(save({...payload,managed_border:{}}),/BORDER_REQUIRED/)
  await assert.rejects(save({...payload,managed_charges:[{key:'chaman',amount:'20',currency:'AFN'}]}),/INVALID_MANAGED_CHARGES/)
  const booking = await save(payload,request)
  assert.equal(await save(payload,request),booking)
  let details=await finance(booking)
  assert.equal(details.foreign_plate,'Foreign plate')
  assert.equal(details.balances,null)
  assert.equal(details.charges.length,charges.length)
  const foreign=details.charges.find(row=>row.key==='foreign_freight')
  const customs=details.charges.find(row=>row.key==='customs')
  const commission=details.charges.find(row=>row.key==='commission')
  const payExpense = (charge, account, req=uid()) => call('pay_managed_booking_expense',[req,charge.id,account,today,charge.amount,charge.currency])
  await assert.rejects(payExpense(foreign,otherBranch),/ACCESS_DENIED/)
  await assert.rejects(payExpense(foreign,null),/ACCESS_DENIED/)
  await assert.rejects(payExpense(commission,branch),/MANAGED_EXPENSE_UNAVAILABLE/)
  await assert.rejects(payExpense({...foreign,amount:299},branch),/STALE_RECORD/)
  const expenseReq=uid()
  assert.equal(await payExpense(foreign,branch,expenseReq),expenseReq)
  assert.equal(await payExpense(foreign,branch,expenseReq),expenseReq)
  await assert.rejects(payExpense(foreign,branch),/MANAGED_EXPENSE_ALREADY_PAID/)
  const branchRows = await call('branch_cashbook_rows')
  assert.equal(branchRows.length,1)
  assert.equal(branchRows[0].direction,'out')
  assert.equal(Number(branchRows[0].amount),300)
  assert.equal(branchRows[0].private_activity,false)

  await signIn(otherManager)
  assert.equal(await finance(booking),undefined)
  await assert.rejects(payExpense(customs,otherBranch),/ACCESS_DENIED/)
  await signIn(president)
  const headOfficeExpense=await payExpense(customs,null)
  const ledger=(await db.query('select e.direction,e.booking_id,a.currency,a.branch_id from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id where e.operation_id=$1',[headOfficeExpense])).rows[0]
  assert.deepEqual(ledger,{direction:'out',booking_id:booking,currency:'AFN',branch_id:null})
  const reservation=(await db.query('select departure_date::text,arrival_date::text,onward_vehicle_id,onward_driver_id from public.bookings where id=$1',[booking])).rows[0]
  assert.deepEqual(reservation,{departure_date:today,arrival_date:today,onward_vehicle_id:null,onward_driver_id:null})
  const receipt={branch_id:branch,currency:'USD',direction:'in',amount:'100',date:today,description:'Trader installment',trader_id:trader,booking_id:booking}
  const receiptRequest=uid()
  assert.equal(await call('cashbook_simple_post',[receiptRequest,receipt]),receiptRequest)
  assert.equal(await call('cashbook_simple_post',[receiptRequest,receipt]),receiptRequest)
  await call('cashbook_simple_post',[uid(),{...receipt,currency:'AFN',amount:'1000'}])
  await assert.rejects(call('cashbook_simple_post',[uid(),{...receipt,amount:'221'}]),/MANAGED_PAYMENT_EXCEEDS_BALANCE/)
  await assert.rejects(call('cashbook_simple_post',[uid(),{...receipt,currency:'IRR'}]),/BOOKING_PAYMENT_UNAVAILABLE/)
  const correction=(await db.query('select id from public.cashbook_entries where operation_id=$1',[receiptRequest])).rows[0].id
  await assert.rejects(call('correct_cashbook_amount',[uid(),correction,100,321,'Too high']),/MANAGED_PAYMENT_EXCEEDS_BALANCE/)
  const expenseEntry=(await db.query('select id from public.cashbook_entries where operation_id=$1',[expenseReq])).rows[0].id
  await assert.rejects(call('correct_cashbook_amount',[uid(),expenseEntry,300,250,'Use reversal']),/MANAGED_EXPENSE_LOCKED/)
  const stamp=(await db.query('select updated_at::text from public.bookings where id=$1',[booking])).rows[0].updated_at
  await assert.rejects(save({...payload,managed_charges:charges.slice(1)},uid(),booking,stamp),/MANAGED_EXPENSE_LOCKED/)
  await assert.rejects(save({...payload,managed_charges:charges.map(row=>row.key==='afghan_freight'?{...row,currency:'USD'}:row).filter(row=>row.key!=='commission'&&row.key!=='terminal'&&row.key!=='labour').map(row=>row.key==='customs'?{...row,amount:'1'}:row)},uid(),booking,stamp),/MANAGED_EXPENSE_LOCKED/)
  details=await finance(booking)
  assert.deepEqual(details.balances,[
    {currency:'AFN',charged:15150.25,paid:1000},
    {currency:'USD',charged:320.5,paid:100},
  ])

  await call('reverse_cashbook_entry',[expenseReq,'Expense refund'])
  assert.equal((await finance(booking)).charges.find(row=>row.id===foreign.id).paid_on,null)
  await call('reverse_cashbook_entry',[receiptRequest,'Trader refund'])
  assert.equal((await finance(booking)).balances.find(row=>row.currency==='USD').paid,0)
  const adjusted=charges.map(row=>row.key==='foreign_freight'?{...row,amount:'280'}:row)
  assert.equal(await save({...payload,managed_charges:adjusted},uid(),booking,stamp),booking)
  assert.equal((await finance(booking)).balances.find(row=>row.currency==='USD').charged,300.5)
  assert.equal(Number((await db.query('select amount from public.cashbook_entries where id=$1',[expenseEntry])).rows[0].amount),300)
  await signIn(manager)
  await payExpense({...foreign,amount:280},branch)
  await signIn(traderUser)
  const portal=await call('trader_portal_statement')
  assert.equal(portal.bookings.find(row=>row.id===booking).managed_transport,true)
  assert.equal(portal.charges.filter(row=>row.booking_id===booking).length,charges.length)
  assert.equal(portal.charges.find(row=>row.id===foreign.id).paid_on,today)
  assert.equal(portal.payments.filter(row=>row.booking_id===booking).length,3)
  assert.ok(portal.payments.every(row=>row.receipt_number>0))
  assert.ok(!JSON.stringify(portal).includes('Foreign name'))
  await assert.rejects(payExpense(customs,branch),/ACCESS_DENIED/)
  await signIn(otherTraderUser)
  assert.equal((await call('trader_portal_statement')).bookings.length,0)
  await signIn(driverUser)
  const job=(await call('get_driver_portal')).bookings.find(row=>row.id===booking)
  assert.equal(job.origin,'Islam Qala')
  assert.equal(job.sender_address,'Islam Qala')
  assert.equal(job.destination,'Kabul')
  assert.equal(job.has_handoff,false)
  assert.ok(!JSON.stringify(job).includes('Foreign name'))
  assert.deepEqual((await call('company_expenses',[true,null,today,today])).payments,[])
  assert.equal(await call('company_overview',[true,null,today]),null)
  await signIn(manager)
  const electricity = [uid(),branch,'electricity','AFN','Office electricity',today,1500,null]
  assert.equal(await call('save_office_expense',electricity),electricity[0])
  assert.equal(await call('save_office_expense',electricity),electricity[0])
  await assert.rejects(call('save_office_expense',[uid(),null,...electricity.slice(2)]),/ACCESS_DENIED/)
  const rent = [uid(),branch,'rent','AFN','Office rent',today,2000,today]
  await call('save_office_expense',rent)
  const overview = () => call('company_overview',[false,branch,today])
  assert.equal((await overview()).money[0].bills,2000)
  const payment = [uid(),rent[0],today,750]
  await call('pay_office_bill',payment)
  await call('pay_office_bill',payment)
  assert.equal((await overview()).money[0].bills,1250)
  await assert.rejects(call('pay_office_bill',[uid(),rent[0],today,1251]),/INVALID_AMOUNT/)
  const list = () => call('company_expenses',[true,null,today,today])
  assert.equal((await list()).payments.filter(row=>row.operation_id===electricity[0]).length,1)
  assert.ok((await list()).payments.find(row=>row.operation_id===payment[0]).receipt_number>0)
  await signIn(otherManager)
  assert.deepEqual((await list()).bills,[])
  await assert.rejects(call('pay_office_bill',[uid(),rent[0],today,100]),/ACCESS_DENIED/)
  await signIn(president)
  const paymentEntry = (await db.query('select id from public.cashbook_entries where operation_id=$1',[payment[0]])).rows[0].id
  await assert.rejects(call('correct_cashbook_amount',[uid(),paymentEntry,750,2001,'Too high']),/INVALID_AMOUNT/)
  await call('reverse_cashbook_entry',[payment[0],'Reverse partial payment'])
  assert.equal((await overview()).money[0].bills,2000)
  assert.equal((await list()).payments.filter(row=>row.expense_id===rent[0]).reduce((total,row)=>total+(row.direction==='out'?1:-1)*row.amount,0),0)
  console.log('Company overview and expenses passed: one receipt per request, branch isolation, partial payment, corrections and reversal.')
  console.log('Managed bookings passed: structured charges, one fleet pair, mixed currencies, installments, expense receipts, reversals and role isolation.')
} catch(error) {
  console.error(error.message,error.code,error.where)
  process.exitCode=1
} finally {
  await db.close()
}
