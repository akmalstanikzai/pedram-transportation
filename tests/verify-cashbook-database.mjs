// Optional integration check using a disposable in-memory PostgreSQL (PGlite).
// Set CASHBOOK_PGLITE_PATH to the installed package's dist/index.js.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.env.CASHBOOK_PGLITE_PATH).href)
const db=new PGlite()
const president='00000000-0000-0000-0000-000000000001',manager='00000000-0000-0000-0000-000000000002'
const branch1='10000000-0000-0000-0000-000000000001',branch2='10000000-0000-0000-0000-000000000002'
const cash='20000000-0000-0000-0000-000000000001',bank='20000000-0000-0000-0000-000000000002',other='20000000-0000-0000-0000-000000000003'
const booking='30000000-0000-0000-0000-000000000001'
await db.exec(`create schema auth; create role authenticated;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table public.branches(id uuid primary key);
 create table public.profiles(id uuid primary key,role text,branch_id uuid,account_enabled boolean default true);
 create table public.bookings(id uuid primary key);
 create function public.is_president_user() returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='president') $$;
 insert into auth.users values('${president}'),('${manager}');
 insert into public.branches values('${branch1}'),('${branch2}');
 insert into public.profiles(id,role,branch_id) values('${president}','president',null),('${manager}','branch_manager','${branch1}');
 insert into public.bookings values('${booking}');
 alter table public.bookings enable row level security; grant select on public.bookings to authenticated;
 select set_config('app.user_id','${president}',false);`)
await db.exec(await readFile(new URL('../supabase/migrations/202611010001_branch_cashbooks.sql',import.meta.url),'utf8'))
await db.exec(`insert into public.cashbook_accounts(id,branch_id,channel,currency,opening_date,opening_balance) values
 ('${cash}','${branch1}','cash','AFN','2026-01-01',100),('${bank}','${branch1}','bank','AFN','2026-01-01',0),('${other}','${branch2}','cash','AFN','2026-01-01',0); set role authenticated;`)
let n=0
const request=()=>`40000000-0000-0000-0000-${String(++n).padStart(12,'0')}`
const base={mode:'income',account_id:cash,date:'2026-01-02',amount:'40.10',party:'Test trader',description:'Receipt'}
async function post(data,id=request()) { return db.query('select public.cashbook_post($1::uuid,$2::jsonb) as id',[id,JSON.stringify({...base,...data})]) }
async function count(){return Number((await db.query('select count(*) as n from public.cashbook_entries')).rows[0].n)}
const id=request();await post({},id);await post({},id);assert.equal(await count(),1,'retry must not duplicate receipt')
await post({mode:'expense',amount:'20.05'})
await post({mode:'transfer',destination_id:bank,amount:'30'})
assert.equal(await count(),4,'transfer creates both sides')
const before=await count()
await assert.rejects(post({mode:'expense',amount:'9999'}),/INSUFFICIENT_BALANCE/)
assert.equal(await count(),before,'failed expense rolls back')
await post({booking_id:booking,agreed_total:'100',amount:'50'})
assert.equal(Number((await db.query('select agreed_total from public.cashbook_booking_terms')).rows[0].agreed_total),100)
const reverse=request();await post({mode:'reversal',reverse_id:id,description:'Correct mistake'},reverse)
await assert.rejects(post({mode:'reversal',reverse_id:id,description:'Again'}),/ALREADY_REVERSED/)
await db.query("select set_config('app.user_id',$1,false)",[manager])
assert.equal((await db.query('select * from public.cashbook_accounts')).rows.length,2,'manager must not see other branch account')
await assert.rejects(post({mode:'transfer',destination_id:other,amount:'1'}),/INVALID_DESTINATION/)
await assert.rejects(db.query('insert into public.cashbook_entries(operation_id,account_id,entry_date,direction,amount,party,description) values($1,$2,\'2026-01-02\',\'in\',1,\'x\',\'x\')',[id,cash]),/permission denied/)
await assert.rejects(db.query('delete from public.cashbook_entries'),/permission denied/)
await db.query("select set_config('app.user_id',$1,false)",[president])
await post({mode:'transfer',destination_id:other,amount:'1'})
const backwards=request()
await post({mode:'expense',account_id:bank,date:'2026-01-03',amount:'25'},backwards)
await assert.rejects(post({mode:'expense',account_id:bank,date:'2026-01-02',amount:'10'}),/INSUFFICIENT_BALANCE/,'backdated entry must not invalidate later closing balance')
const transfer=request()
await post({mode:'transfer',destination_id:other,amount:'1'},transfer)
await post({mode:'reversal',reverse_id:transfer,description:'Reverse both sides'})
assert.equal(Number((await db.query('select count(*) as n from public.cashbook_entries e join public.cashbook_operations o on o.id=e.operation_id where o.reverses_id=$1',[transfer])).rows[0].n),2)
await db.exec(`reset role; update public.profiles set account_enabled=false where id='${manager}'; set role authenticated;`)
await db.query("select set_config('app.user_id',$1,false)",[manager])
assert.equal((await db.query('select * from public.cashbook_accounts')).rows.length,0,'disabled manager must not read accounts')
await assert.rejects(post({amount:'1'}),/ACCESS_DENIED/)
// Verify upgrading an existing cashbook preserves all data and disables the old API.
await db.exec(`reset role; update public.profiles set account_enabled=true where id='${manager}';`)
const saved=Number((await db.query('select count(*) as n from public.cashbook_entries')).rows[0].n)
await db.exec(await readFile(new URL('../supabase/migrations/202611010002_simplify_cashbook.sql',import.meta.url),'utf8'))
assert.equal(Number((await db.query('select count(*) as n from public.cashbook_entries')).rows[0].n),saved)
await db.exec('set role authenticated')
await db.query("select set_config('app.user_id',$1,false)",[president])
await assert.rejects(post({mode:'transfer',destination_id:other,amount:'1'}),/does not exist/)
async function simple(data,id=request()) { return db.query('select public.cashbook_simple_post($1::uuid,$2::jsonb)',[id,JSON.stringify({branch_id:null,currency:'AFN',direction:'in',amount:'100',date:'2026-01-02',description:'Simple receipt',...data})]) }
const simpleId=request();await simple({},simpleId);await simple({},simpleId)
assert.equal(Number((await db.query("select count(*) as n from public.cashbook_entries where operation_id=$1",[simpleId])).rows[0].n),1)
assert.equal(Number((await db.query("select count(*) as n from public.cashbook_accounts where branch_id is null and channel='ledger'")).rows[0].n),1)
await simple({branch_id:branch2,direction:'out',amount:'200'})
await assert.rejects(simple({amount:'-1'}),/INVALID_AMOUNT/)
await assert.rejects(simple({direction:'transfer'}),/INVALID_ENTRY/)
await db.query("select set_config('app.user_id',$1,false)",[manager])
assert.equal((await db.query('select * from public.cashbook_accounts where branch_id is null')).rows.length,0)
await simple({branch_id:branch1,amount:'10'})
await assert.rejects(simple({branch_id:null}),/ACCESS_DENIED/)
await assert.rejects(simple({branch_id:branch2}),/ACCESS_DENIED/)
await assert.rejects(db.query("insert into public.cashbook_accounts(branch_id,channel,currency,opening_date,opening_balance) values($1,'ledger','USD','2026-01-01',0)",[branch1]),/permission denied/)
console.log('Simple cashbook database checks passed: existing data preserved, old API removed, automatic admin/branch ledgers, in/out, retries, and branch isolation.')
await db.close()
