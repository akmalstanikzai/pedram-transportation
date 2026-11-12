begin;

alter table public.cashbook_entries
 add column if not exists loan_repayment_entry_id uuid references public.cashbook_entries(id);
create index if not exists cashbook_loan_repayments_idx on public.cashbook_entries(loan_repayment_entry_id)
 where loan_repayment_entry_id is not null;

create or replace function public.loan_remaining_amount(p_loan uuid)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare original public.cashbook_entries; repaid numeric;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 select * into original from public.cashbook_entries where id=p_loan and loan_due_date is not null;
 if not found or exists(select 1 from public.cashbook_operations where reverses_id=original.operation_id)
 then return 0; end if;
 select coalesce(sum(case when direction='in' then amount else -amount end),0)
 into repaid from public.cashbook_entries where loan_repayment_entry_id=p_loan;
 return greatest(0,original.amount-repaid);
end; $$;
revoke all on function public.loan_remaining_amount(uuid) from public,anon;
grant execute on function public.loan_remaining_amount(uuid) to authenticated;

create or replace function public.open_cashbook_loans()
returns jsonb language sql stable security definer set search_path='' as $$
 select case when public.is_president_user() then coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'receipt_number',o.receipt_number,'date',e.entry_date,
  'due_date',e.loan_due_date,'amount',e.amount,'remaining',public.loan_remaining_amount(e.id),
  'currency',a.currency,'employee_id',e.employee_id,'driver_id',e.driver_id,
  'person',case when e.employee_id is not null then concat_ws(' ',em.first_name,em.last_name) else d.full_name end
 ) order by e.loan_due_date,e.entry_date)
 from public.cashbook_entries e
 join public.cashbook_accounts a on a.id=e.account_id
 join public.cashbook_operations o on o.id=e.operation_id
 left join public.employees em on em.id=e.employee_id
 left join public.drivers d on d.id=e.driver_id
 where e.loan_due_date is not null and public.loan_remaining_amount(e.id)>0),'[]'::jsonb)
 else '[]'::jsonb end;
$$;
revoke all on function public.open_cashbook_loans() from public,anon;
grant execute on function public.open_cashbook_loans() to authenticated;

create or replace function public.cashbook_simple_post(p_request uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare employee uuid := nullif(p_data->>'employee_id','')::uuid;
 driver uuid := nullif(p_data->>'driver_id','')::uuid;
 deadline date := nullif(p_data->>'loan_due_date','')::date;
 repayment uuid := nullif(p_data->>'loan_repayment_entry_id','')::uuid;
 original public.cashbook_entries;
 operation uuid; existing public.cashbook_operations;
 amount numeric := nullif(p_data->>'amount','')::numeric;
begin
 if repayment is not null then
  if not public.is_president_user() or p_data->>'direction' is distinct from 'in'
   or employee is not null or driver is not null or deadline is not null
   or nullif(p_data->>'trader_id','') is not null or nullif(p_data->>'booking_id','') is not null
   then raise exception 'INVALID_LOAN_REPAYMENT'; end if;
  select * into original from public.cashbook_entries where id=repayment and loan_due_date is not null for update;
  if not found then raise exception 'LOAN_UNAVAILABLE'; end if;
  if not exists(select 1 from public.cashbook_accounts a where a.id=original.account_id and a.currency=p_data->>'currency')
   then raise exception 'LOAN_CURRENCY_MISMATCH'; end if;
  select * into existing from public.cashbook_operations where id=p_request;
  if found then
   if existing.created_by is distinct from auth.uid() or existing.request_payload is distinct from p_data
   then raise exception 'REQUEST_CONFLICT'; end if;
  elsif amount is null or amount<=0 or amount>public.loan_remaining_amount(repayment) then
   raise exception 'LOAN_REPAYMENT_EXCEEDS_BALANCE';
  end if;
  employee:=original.employee_id; driver:=original.driver_id;
  if employee is null and driver is null then raise exception 'LOAN_UNAVAILABLE'; end if;
 end if;
 if deadline is not null then
  if not public.is_president_user() or p_data->>'direction' is distinct from 'out'
   or (employee is null and driver is null) or (employee is not null and driver is not null)
   or nullif(p_data->>'trader_id','') is not null or nullif(p_data->>'booking_id','') is not null
   then raise exception 'INVALID_LOAN'; end if;
  if deadline < nullif(p_data->>'date','')::date then raise exception 'INVALID_LOAN_DEADLINE'; end if;
 end if;
 if (employee is not null or driver is not null) and repayment is null then
  if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
  if p_data->>'direction' is distinct from 'out'
   or (employee is not null and driver is not null)
   or nullif(p_data->>'trader_id','') is not null
   or nullif(p_data->>'booking_id','') is not null then raise exception 'INVALID_PARTY_PAYMENT'; end if;
  if employee is not null and not exists (select 1 from public.employees where id=employee and archived_at is null)
   and not exists (select 1 from public.cashbook_operations where id=p_request and request_payload=p_data)
   then raise exception 'EMPLOYEE_UNAVAILABLE'; end if;
  if driver is not null and not exists (select 1 from public.drivers where id=driver and archived_at is null and (branch_id is null or nullif(p_data->>'branch_id','') is null or branch_id=nullif(p_data->>'branch_id','')::uuid))
   and not exists (select 1 from public.cashbook_operations where id=p_request and request_payload=p_data)
   then raise exception 'DRIVER_UNAVAILABLE'; end if;
 end if;
 if nullif(p_data->>'trader_id','') is not null or nullif(p_data->>'booking_id','') is not null then
  if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 end if;
 if nullif(p_data->>'booking_id','') is not null and exists (
  select 1 from public.bookings b where b.id=(p_data->>'booking_id')::uuid
   and (b.deleted_at is not null or (b.commission_currency is not null and b.commission_currency is distinct from p_data->>'currency'))
 ) then
  if not exists(select 1 from public.cashbook_operations o where o.id=p_request and o.created_by=auth.uid() and o.request_payload=p_data)
   then raise exception 'BOOKING_PAYMENT_UNAVAILABLE'; end if;
 end if;
 operation := pedram_private.cashbook_simple_post(p_request,p_data);
 if employee is not null then
  update public.cashbook_entries set employee_id=employee
   where operation_id=operation and employee_id is distinct from employee;
 end if;
 if driver is not null then
  update public.cashbook_entries set driver_id=driver
   where operation_id=operation and driver_id is distinct from driver;
 end if;
 if deadline is not null then
  update public.cashbook_entries set loan_due_date=deadline
   where operation_id=operation and loan_due_date is distinct from deadline;
 end if;
 if repayment is not null then
  update public.cashbook_entries set loan_repayment_entry_id=repayment
   where operation_id=operation and loan_repayment_entry_id is distinct from repayment;
 end if;
 return operation;
end; $$;

-- Reversing a repayment subtracts it from the paid amount; reversing the loan
-- removes it from the open-loan list while preserving both cashbook entries.
create or replace function public.reverse_cashbook_entry(p_operation uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare original public.cashbook_operations; reversal uuid;
 reason text := btrim(coalesce(p_reason,''));
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if char_length(reason) not between 1 and 500 then raise exception 'REVERSAL_REASON_REQUIRED'; end if;
 select * into original from public.cashbook_operations where id=p_operation for update;
 if not found or original.mode='reversal' or not exists (
  select 1 from public.cashbook_entries where operation_id=p_operation
 ) then raise exception 'INVALID_REVERSAL'; end if;
 if exists (select 1 from public.cashbook_entries e where e.operation_id=p_operation and e.loan_due_date is not null
  and exists (select 1 from public.cashbook_entries r where r.loan_repayment_entry_id=e.id)
  and public.loan_remaining_amount(e.id)<e.amount) then raise exception 'LOAN_HAS_REPAYMENTS'; end if;
 select id into reversal from public.cashbook_operations where reverses_id=p_operation;
 if found then return reversal; end if;
 reversal := gen_random_uuid();
 insert into public.cashbook_operations(id,mode,reverses_id,created_by,request_payload)
 values(reversal,'reversal',p_operation,auth.uid(),jsonb_build_object('reason',reason));
 insert into public.cashbook_entries(operation_id,account_id,entry_date,direction,amount,party,
  description,reference,booking_id,trader_id,employee_id,driver_id,loan_repayment_entry_id,is_transfer)
 select reversal,account_id,(now() at time zone 'Asia/Kabul')::date,
  case when direction='in' then 'out' else 'in' end,amount,party,
  'Reversal of #'||original.receipt_number||': '||reason,reference,booking_id,trader_id,employee_id,driver_id,loan_repayment_entry_id,is_transfer
 from public.cashbook_entries where operation_id=p_operation;
 return reversal;
end; $$;

create or replace function public.employee_cashbook_transactions(p_employee uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when public.is_president_user() and exists(select 1 from public.employees where id=p_employee)
 then coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'date',e.entry_date,'direction',e.direction,'amount',e.amount,
  'currency',a.currency,'description',e.description,'receipt_number',o.receipt_number,
  'branch',coalesce(b.name,'Admin'),'reversal',o.mode='reversal',
  'loan_due_date',e.loan_due_date,'loan_repayment_entry_id',e.loan_repayment_entry_id,
  'loan_remaining',case when e.loan_due_date is not null then public.loan_remaining_amount(e.id) else null end,
  'reversed_by',(select r.receipt_number from public.cashbook_operations r where r.reverses_id=o.id)
 ) order by e.entry_date desc,o.receipt_number desc)
 from public.cashbook_entries e
 join public.cashbook_accounts a on a.id=e.account_id
 join public.cashbook_operations o on o.id=e.operation_id
 left join public.branches b on b.id=a.branch_id
 where e.employee_id=p_employee and not e.is_transfer),'[]'::jsonb)
 else '[]'::jsonb end;
$$;

create or replace function public.driver_cashbook_transactions(p_driver uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when public.is_president_user() and exists(select 1 from public.drivers where id=p_driver)
 then coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'date',e.entry_date,'direction',e.direction,'amount',e.amount,
  'currency',a.currency,'description',e.description,'receipt_number',o.receipt_number,
  'branch',coalesce(b.name,'Admin'),'reversal',o.mode='reversal',
  'loan_due_date',e.loan_due_date,'loan_repayment_entry_id',e.loan_repayment_entry_id,
  'loan_remaining',case when e.loan_due_date is not null then public.loan_remaining_amount(e.id) else null end,
  'reversed_by',(select r.receipt_number from public.cashbook_operations r where r.reverses_id=o.id)
 ) order by e.entry_date desc,o.receipt_number desc)
 from public.cashbook_entries e
 join public.cashbook_accounts a on a.id=e.account_id
 join public.cashbook_operations o on o.id=e.operation_id
 left join public.branches b on b.id=a.branch_id
 where e.driver_id=p_driver and not e.is_transfer),'[]'::jsonb)
 else '[]'::jsonb end;
$$;

commit;
