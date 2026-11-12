begin;

-- A due date marks an employee or driver Money Out entry as a loan.
-- The partial index supports the future due-loan notification query.
alter table public.cashbook_entries add column if not exists loan_due_date date;
do $$ begin
 if not exists (select 1 from pg_constraint where conrelid='public.cashbook_entries'::regclass and conname='cashbook_loan_deadline_check') then
  alter table public.cashbook_entries add constraint cashbook_loan_deadline_check
   check (loan_due_date is null or (direction='out' and loan_due_date>=entry_date
    and ((employee_id is not null and driver_id is null) or (driver_id is not null and employee_id is null))));
 end if;
end $$;
create index if not exists cashbook_loan_due_idx on public.cashbook_entries(loan_due_date)
 where loan_due_date is not null;

create or replace function public.cashbook_simple_post(p_request uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare employee uuid := nullif(p_data->>'employee_id','')::uuid;
 driver uuid := nullif(p_data->>'driver_id','')::uuid;
 deadline date := nullif(p_data->>'loan_due_date','')::date;
 operation uuid;
begin
 if deadline is not null then
  if not public.is_president_user() or p_data->>'direction' is distinct from 'out'
   or (employee is null and driver is null) or (employee is not null and driver is not null)
   or nullif(p_data->>'trader_id','') is not null or nullif(p_data->>'booking_id','') is not null
   then raise exception 'INVALID_LOAN'; end if;
  if deadline < nullif(p_data->>'date','')::date then raise exception 'INVALID_LOAN_DEADLINE'; end if;
 end if;
 if employee is not null or driver is not null then
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
 return operation;
end; $$;

create or replace function public.employee_cashbook_transactions(p_employee uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when public.is_president_user() and exists(select 1 from public.employees where id=p_employee)
 then coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'date',e.entry_date,'direction',e.direction,'amount',e.amount,
  'currency',a.currency,'description',e.description,'receipt_number',o.receipt_number,
  'branch',coalesce(b.name,'Admin'),'reversal',o.mode='reversal',
  'loan_due_date',e.loan_due_date,
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
  'loan_due_date',e.loan_due_date,
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
