// Disposable PostgreSQL verification. Set PEDRAM_PGLITE_PATH to PGlite's dist/index.js.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PEDRAM_PGLITE_PATH) throw new Error('PEDRAM_PGLITE_PATH is required')
const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
const id = () => crypto.randomUUID()
const call = async (name, args = []) => (await db.query(
  `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as result`,
  args.map(value => value && typeof value === 'object' ? JSON.stringify(value) : value),
)).rows[0].result
try {
  await db.exec(`
    create schema auth; create schema storage; create role anon; create role authenticated; create role service_role bypassrls;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',unique(bucket_id,name));
    alter table storage.objects enable row level security; grant select,insert,delete on storage.objects to authenticated;
  `)
  const migrations = new URL('../supabase/migrations/', import.meta.url)
  for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    try { await db.exec(await readFile(new URL(name, migrations), 'utf8')) }
    catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }) }
  }

  const president = id(), manager = id(), agent = id()
  await db.query('insert into auth.users(id) values($1),($2)', [president, manager])
  await db.query("update public.profiles set role='president' where id=$1", [president])
  const signIn = async user => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user])
    await db.exec('set role authenticated')
  }
  await signIn(president)
  const branch = await call('save_branch_record', [null, id(), {name:'Kabul',province:'Kabul',city:'Kabul'}, null, null])
  const trader = await call('save_trader_record', [null, id(), {first_name:'Test',last_name:'Trader',phone:'0700000002',address:'Kabul'}, null])
  const driver = await call('save_fleet_record',['driver',null,id(),{full_name:'Driver',phone:'0700000005',status:'available'},null])
  const vehicle = await call('save_fleet_record',['vehicle',null,id(),{plate_number:'ABC 123',vehicle_type:'Truck',capacity_tons:10,status:'available'},null])
  const today = (await db.query("select (now() at time zone 'Asia/Kabul')::date::text as today")).rows[0].today
  const booking = await call('save_booking_record', [null,id(),{
    trader_id:trader, vehicle_id:vehicle, driver_id:driver, booking_date:today, origin:'Kabul', destination:'Herat', goods:'Food',
    quantity_unit:'tons', quantity_amount:'5', service_type:'arrangement', commission_amount:'100', commission_currency:'AFN',
    trader_first_name:'Test',trader_last_name:'Trader',trader_phone:'0700000002',trader_address:'Kabul',
    sender_name:'Sender',sender_phone:'0700000003',sender_address:'Kabul',
    receiver_name:'Receiver',receiver_phone:'0700000004',receiver_address:'Herat',
  },null])
  await call('save_customs_agent', [agent, {name:'Test agent',phone:'0700000000'}, null])
  const fee = id(), dollarFee = id()
  const add = (request, currency, amount, bookingId) => call('add_customs_agent_fee', [request,agent,today,currency,amount,'Clearance work',bookingId])
  assert.equal(await add(fee, 'AFN', 5000, booking), fee)
  assert.equal(await add(fee, 'AFN', 5000, booking), fee)
  await assert.rejects(add(fee, 'AFN', 6000, booking), /REQUEST_CONFLICT/)
  await add(dollarFee, 'USD', 100, null)
  assert.equal((await db.query('select id from public.cashbook_entries')).rows.length, 0)
  const statement = () => call('customs_agent_statement', [agent])
  const remaining = async feeId => (await statement()).fees.find(row => row.id === feeId).remaining
  const pay = (request, feeId, branchId, amount, currency = 'AFN') =>
    call('pay_customs_agent_fee', [request,feeId,branchId,today,currency,amount,'First installment',null])
  const payment = id()
  assert.equal(await pay(payment, fee, branch, 2000), payment)
  assert.equal(await pay(payment, fee, branch, 2000), payment)
  await assert.rejects(pay(payment, fee, branch, 2001), /REQUEST_CONFLICT/)
  await assert.rejects(pay(id(), fee, branch, 3001), /CUSTOMS_EXCEEDS_BALANCE/)
  await assert.rejects(pay(id(), fee, branch, 100, 'USD'), /CUSTOMS_CURRENCY_MISMATCH/)
  assert.equal(await remaining(fee), 3000)
  assert.equal(await remaining(dollarFee), 100)
  const [first] = (await statement()).payments
  assert.equal(first.branch, 'Kabul')
  assert.equal(first.direction, 'out')
  assert.ok(first.receipt_number)
  assert.ok(first.booking_number)
  assert.equal((await db.query('select id,booking_id,trader_id from public.cashbook_entries')).rows.length, 1)
  assert.deepEqual((await db.query('select booking_id,trader_id from public.cashbook_entries')).rows[0], {booking_id:null,trader_id:null})
  const settlement = id()
  await pay(settlement, fee, null, 3000)
  assert.equal(await remaining(fee), 0)
  await assert.rejects(call('correct_cashbook_amount',[id(),first.id,2000,2100,'Too much']), /CUSTOMS_EXCEEDS_BALANCE/)
  await call('correct_cashbook_amount',[id(),first.id,2000,1500,'Correct amount'])
  assert.equal(await remaining(fee), 500)
  assert.equal((await statement()).payments.find(row => row.id === first.id).corrected, true)
  await call('reverse_cashbook_entry', [payment,'Wrong account'])
  assert.equal(await remaining(fee), 2000)
  const history = (await statement()).payments
  assert.equal(history.find(row => row.reversal).amount, 1500)
  assert.equal(history.find(row => row.reversal).reverses_receipt, first.receipt_number)
  assert.ok(history.find(row => row.id === first.id).reversed_by)
  assert.equal(await pay(payment, fee, branch, 2000), payment)
  assert.equal((await statement()).payments.length, 3)

  await db.exec('reset role')
  await db.query("update public.profiles set role='branch_manager',branch_id=$1 where id=$2",[branch,manager])
  await signIn(manager)
  await assert.rejects(statement(), /ACCESS_DENIED/)
  await assert.rejects(add(id(),'AFN',500,null), /ACCESS_DENIED/)
  await assert.rejects(pay(id(),fee,branch,1), /ACCESS_DENIED/)
  const branchRows = await call('branch_cashbook_rows')
  assert.equal(branchRows.length,2)
  assert.ok(branchRows.every(row => row.amount === 1500 && !row.description.includes('Test agent')))
  console.log('Customs fees, optional booking, branch and central payments, retries, limits, corrections, reversals and role scope passed.')
} finally {
  await db.close()
}
