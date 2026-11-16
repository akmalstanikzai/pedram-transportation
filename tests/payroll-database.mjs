// Disposable PostgreSQL only; does not connect to hosted Supabase.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
if (!process.env.PEDRAM_PGLITE_PATH) throw Error('PEDRAM_PGLITE_PATH is required')
const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite(), uid = () => crypto.randomUUID()
const president = uid(), manager = uid(), driver = uid(), trader = uid(), employee = uid()
const call = async (name,args = []) => (await db.query(`select public.${name}(${args.map((_,i) => '$'+(i+1)).join(',')}) result`,args.map(value => typeof value === 'object' && value !== null ? JSON.stringify(value) : value))).rows[0].result
try {
  await db.exec(`create schema auth;create schema storage;create role anon;create role authenticated;create role service_role bypassrls;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',unique(bucket_id,name));
    alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;grant select on storage.buckets to authenticated;`)
  for (const name of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(name => name.endsWith('.sql')).sort()) {
    try { await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8')) }
    catch (error) { throw Error(`${name}: ${error.message}`,{cause:error}) }
  }
  for (const [id,role] of [[president,'president'],[manager,'branch_manager'],[driver,'driver'],[trader,'trader']]) {
    await db.query('insert into auth.users(id) values($1)',[id])
    await db.query('update public.profiles set role=$2::public.app_role where id=$1',[id,role])
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[president])
  await db.exec('set role authenticated')
  await db.query("insert into public.employees(id,first_name,last_name,phone,province,district,village,salary) values($1,'Employee','One','0700000000','Kabul','District','Village',15000)",[employee])
  await assert.rejects(call('prepare_employee_payroll',[1405,13]), /INVALID_PAYROLL_MONTH/)
  assert.deepEqual(await call('employee_payroll_month',[1405,8]), [])
  await call('prepare_employee_payroll',[1405,8]); await call('prepare_employee_payroll',[1405,8])
  let rows = await call('employee_payroll_month',[1405,8]); const payroll = rows[0].id
  assert.equal(rows.length,1); assert.equal(rows[0].salary,15000); assert.equal(rows[0].remaining,15000)
  await db.query('update public.employees set salary=20000 where id=$1',[employee])
  await call('prepare_employee_payroll',[1405,8])
  assert.equal((await call('employee_payroll_month',[1405,8]))[0].salary,15000)
  await call('prepare_employee_payroll',[1405,9])
  assert.equal((await call('employee_payroll_month',[1405,9]))[0].salary,20000)
  assert.equal(Number((await db.query('select count(*) n from public.cashbook_entries')).rows[0].n),0,'starting payroll must not move cash')
  const today = (await db.query("select (now() at time zone 'Asia/Kabul')::date::text as payment_date")).rows[0].payment_date
  // A personal loan and ordinary employee payment do not reduce payroll.
  await call('cashbook_simple_post',[uid(),{employee_id:employee,currency:'AFN',direction:'out',amount:2000,date:today,description:'Loan',loan_due_date:today}])
  await call('cashbook_simple_post',[uid(),{employee_id:employee,currency:'USD',direction:'out',amount:50,date:today,description:'Unclassified employee payment'}])
  const advance = uid(), salary = uid()
  const pay = (id,kind,amount) => call('pay_employee_payroll',[id,payroll,kind,amount,today,null])
  await pay(advance,'advance',3000); await pay(advance,'advance',3000)
  rows = await call('employee_payroll_month',[1405,8])
  assert.equal(rows[0].advances,3000); assert.equal(rows[0].remaining,12000); assert.equal(rows[0].payments.length,1)
  await assert.rejects(pay(advance,'advance',4000), /REQUEST_CONFLICT/)
  await assert.rejects(pay(uid(),'salary',12000.001), /INVALID_AMOUNT/)
  await assert.rejects(pay(uid(),'salary',12001), /PAYROLL_EXCEEDS_BALANCE/)
  await pay(salary,'salary',12000)
  rows = await call('employee_payroll_month',[1405,8]); assert.equal(rows[0].paid,12000); assert.equal(rows[0].remaining,0)
  await assert.rejects(pay(uid(),'salary',1), /PAYROLL_EXCEEDS_BALANCE/)
  const entry = (await db.query('select * from public.cashbook_entries where operation_id=$1',[salary])).rows[0]
  assert.equal(entry.employee_id,employee); assert.equal(entry.direction,'out')
  assert.equal(Number(entry.amount),12000)
  await assert.rejects(call('correct_cashbook_amount',[uid(),entry.id,12000,12001,'Mistake']), /PAYROLL_EXCEEDS_BALANCE/)
  await call('correct_cashbook_amount',[uid(),entry.id,12000,10000,'Correct amount'])
  assert.equal((await call('employee_payroll_month',[1405,8]))[0].remaining,2000)
  await call('reverse_cashbook_entry',[salary,'Wrong receipt'])
  rows = await call('employee_payroll_month',[1405,8]); assert.equal(rows[0].remaining,12000)
  assert.ok(rows[0].payments.find(payment => payment.id === entry.id).reversed)
  assert.equal((await call('employee_payroll_month',[1405,9]))[0].remaining,20000)
  await db.query('update public.employees set first_name=$2,archived_at=now() where id=$1',[employee,'Renamed'])
  await pay(advance,'advance',3000) // Retry remains valid after rename/archive.
  await assert.rejects(pay(uid(),'salary',1), /EMPLOYEE_UNAVAILABLE/)
  assert.equal((await call('employee_payroll_month',[1405,8]))[0].archived,true)
  for (const id of [manager,driver,trader]) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
    await assert.rejects(call('employee_payroll_month',[1405,8]), /ACCESS_DENIED/)
    await assert.rejects(call('prepare_employee_payroll',[1405,8]), /ACCESS_DENIED/)
    await assert.rejects(pay(uid(),'salary',1), /ACCESS_DENIED/)
    assert.equal((await db.query('select * from public.employee_payroll')).rows.length,0)
    assert.equal((await db.query('select * from public.employee_payroll_payments')).rows.length,0)
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[president])
  await db.exec('reset role')
  await db.query('update public.profiles set account_enabled=false where id=$1',[president])
  await db.exec('set role authenticated')
  await assert.rejects(call('employee_payroll_month',[1405,8]), /ACCESS_DENIED/)
  await assert.rejects(db.query('delete from public.employee_payroll'), /permission denied/)
  console.log('Full migration chain and payroll snapshots, cash posting, retries, corrections, reversals, loans and role restrictions passed.')
} finally { await db.close() }
