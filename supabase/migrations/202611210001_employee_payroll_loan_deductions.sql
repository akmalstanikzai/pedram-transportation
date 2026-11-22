begin;

-- A salary deduction settles a receivable without receiving cash.
create table pedram_private.payroll_loan_deductions (
 operation_id uuid primary key references public.cashbook_operations(id),
 payroll_id uuid not null references public.employee_payroll(id),
 loan_entry_id uuid not null references public.cashbook_entries(id),
 amount numeric(14,2) not null check (amount > 0)
);
create index payroll_loan_deductions_loan_idx on pedram_private.payroll_loan_deductions(loan_entry_id);
create index payroll_loan_deductions_payroll_idx on pedram_private.payroll_loan_deductions(payroll_id);
revoke all on pedram_private.payroll_loan_deductions from public,anon,authenticated;

create view pedram_private.employee_payroll_history as
 select pp.payroll_id,ce.id,ce.operation_id,ce.entry_date as date,pp.payment_kind as kind,
  ce.amount as cash_paid,coalesce(d.amount,0) as deducted,coalesce(b.name,'Admin') as account,
  exists(select 1 from public.cashbook_operations r where r.reverses_id=ce.operation_id) as reversed
 from public.employee_payroll_payments pp join public.cashbook_entries ce on ce.id=pp.entry_id
 join public.cashbook_accounts a on a.id=ce.account_id left join public.branches b on b.id=a.branch_id
 left join pedram_private.payroll_loan_deductions d on d.operation_id=ce.operation_id
 union all
 select d.payroll_id,o.id,o.id,(o.request_payload->>'date')::date,'salary',0,d.amount,coalesce(b.name,'Admin'),
  exists(select 1 from public.cashbook_operations r where r.reverses_id=o.id)
 from pedram_private.payroll_loan_deductions d join public.cashbook_operations o on o.id=d.operation_id
 left join public.branches b on b.id=nullif(o.request_payload->>'branch_id','')::uuid
 where not exists(select 1 from public.cashbook_entries ce where ce.operation_id=o.id);
revoke all on pedram_private.employee_payroll_history from public,anon,authenticated;

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
 select repaid + coalesce(sum(d.amount),0) into repaid
 from pedram_private.payroll_loan_deductions d
 where d.loan_entry_id=p_loan and not exists(select 1 from public.cashbook_operations r where r.reverses_id=d.operation_id);
 return greatest(0,original.amount-repaid);
end; $$;

create or replace function public.employee_payroll_month(p_year integer,p_month integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if p_year is null or p_year not between 1300 and 1600 or p_month is null or p_month not between 1 and 12 then raise exception 'INVALID_PAYROLL_MONTH'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',p.id,'employee_id',e.id,'name',concat_ws(' ',e.first_name,e.last_name),'phone',e.phone,
  'archived',e.archived_at is not null,'salary',p.salary,
  'advances',totals.advances,'paid',totals.paid,'deducted',totals.deducted,'cash_paid',totals.cash_paid,
  'remaining',p.salary-totals.advances-totals.paid,'payments',totals.payments
 ) order by e.first_name,e.last_name,p.id)
 from public.employee_payroll p join public.employees e on e.id=p.employee_id
 cross join lateral (
  select coalesce(sum(h.cash_paid) filter(where h.kind='advance' and not h.reversed),0) advances,
   coalesce(sum(h.cash_paid+h.deducted) filter(where h.kind='salary' and not h.reversed),0) paid,
   coalesce(sum(h.cash_paid) filter(where h.kind='salary' and not h.reversed),0) cash_paid,
   coalesce(sum(h.deducted) filter(where not h.reversed),0) deducted,
   coalesce(jsonb_agg(jsonb_build_object('id',h.id,'date',h.date,'amount',h.cash_paid+h.deducted,
    'cash_paid',h.cash_paid,'deducted',h.deducted,'kind',h.kind,'account',h.account,
    'operation_id',h.operation_id,'reversed',h.reversed) order by h.date desc,h.id),'[]'::jsonb) payments
  from pedram_private.employee_payroll_history h where h.payroll_id=p.id
 ) totals where p.payroll_year=p_year and p.payroll_month=p_month),'[]'::jsonb);
end; $$;

drop function public.pay_employee_payroll(uuid,uuid,text,numeric,date,uuid);

create function public.pay_employee_payroll(
 p_request uuid,p_payroll uuid,p_kind text,p_amount numeric,p_date date,p_branch uuid default null,
 p_loan uuid default null,p_deduction numeric default 0
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 p public.employee_payroll; existing public.cashbook_operations; original_loan public.cashbook_entries;
 payload jsonb; paid numeric; cash_paid numeric; operation uuid; entry uuid;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if p_request is null or p_kind is null or p_kind not in ('advance','salary') then raise exception 'INVALID_ENTRY'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>999999999999.99 then raise exception 'INVALID_AMOUNT'; end if;
 if p_deduction is null or p_deduction<0 or p_deduction>p_amount or p_deduction<>round(p_deduction,2)
  or (p_loan is null) is distinct from (p_deduction=0)
  or (p_loan is not null and p_kind<>'salary') then raise exception 'INVALID_PAYROLL_DEDUCTION'; end if;

 select * into p from public.employee_payroll where id=p_payroll for update;
 if not found then raise exception 'PAYROLL_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 cash_paid:=p_amount-p_deduction;
 payload:=jsonb_build_object('branch_id',p_branch,'currency','AFN','direction','out','amount',cash_paid,'date',p_date,
  'employee_id',p.employee_id,'payroll_id',p.id,'payment_kind',p_kind,
  'description',case when p_kind='advance' then 'Salary advance' else 'Salary payment' end
    ||' · '||p.payroll_year||'/'||lpad(p.payroll_month::text,2,'0')||' · '||
    (select concat_ws(' ',first_name,last_name) from public.employees where id=p.employee_id));
 if p_loan is not null then
  payload:=payload||jsonb_build_object('payroll_loan_id',p_loan,'payroll_loan_deduction',p_deduction,
    'description',(payload->>'description')||' · Loan deducted: '||p_deduction||' AFN');
 end if;
 select * into existing from public.cashbook_operations where id=p_request;
 if found then
  if existing.created_by is distinct from auth.uid() or (existing.request_payload-'description') is distinct from (payload-'description')
   or not exists(select 1 from pedram_private.employee_payroll_history h
     where h.payroll_id=p.id and h.operation_id=existing.id and h.kind=p_kind)
  then raise exception 'REQUEST_CONFLICT'; end if;
  return existing.id;
 end if;
 if p_date is null or p_date>(now() at time zone 'Asia/Kabul')::date then raise exception 'INVALID_DATE'; end if;
 if p_branch is not null and not exists(select 1 from public.branches where id=p_branch and archived_at is null) then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from public.employees where id=p.employee_id and archived_at is not null) then raise exception 'EMPLOYEE_UNAVAILABLE'; end if;
 select coalesce(sum(h.cash_paid+h.deducted),0) into paid from pedram_private.employee_payroll_history h
 where h.payroll_id=p.id and not h.reversed;
 if p_amount>p.salary-paid then raise exception 'PAYROLL_EXCEEDS_BALANCE'; end if;

 if p_loan is not null then
  select e.* into original_loan from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id
  where e.id=p_loan and e.employee_id=p.employee_id and e.loan_due_date is not null and e.direction='out'
    and a.currency='AFN' and e.entry_date<=p_date for update of e;
  if not found then raise exception 'LOAN_UNAVAILABLE'; end if;
  if p_deduction>public.loan_remaining_amount(p_loan) then raise exception 'LOAN_REPAYMENT_EXCEEDS_BALANCE'; end if;
 end if;

 if cash_paid>0 then
  operation:=public.cashbook_simple_post(p_request,payload);
  select id into strict entry from public.cashbook_entries where operation_id=operation;
  insert into public.employee_payroll_payments(entry_id,payroll_id,payment_kind) values(entry,p.id,p_kind);
 else
  -- Keep an operation for retries and reversals when no cash changes hands.
  operation:=p_request;
  insert into public.cashbook_operations(id,mode,created_by,request_payload)
  values(operation,'expense',auth.uid(),payload);
 end if;
 if p_loan is not null then
  insert into pedram_private.payroll_loan_deductions(operation_id,payroll_id,loan_entry_id,amount)
  values(operation,p.id,p_loan,p_deduction);
 end if;
 return operation;
end; $$;

revoke all on function public.pay_employee_payroll(uuid,uuid,text,numeric,date,uuid,uuid,numeric) from public,anon;
grant execute on function public.pay_employee_payroll(uuid,uuid,text,numeric,date,uuid,uuid,numeric) to authenticated;

create or replace function pedram_private.guard_payroll_amount() returns trigger
language plpgsql security definer set search_path='' as $$
declare payroll uuid; salary numeric; other_paid numeric;
begin
 if exists(select 1 from pedram_private.payroll_loan_deductions where operation_id=old.operation_id)
 then raise exception 'PAYROLL_DEDUCTION_REVERSE_REQUIRED'; end if;
 if old.loan_due_date is not null and new.amount < old.amount-public.loan_remaining_amount(old.id)
 then raise exception 'LOAN_AMOUNT_BELOW_RECOVERED'; end if;
 if old.loan_repayment_entry_id is not null then
  perform 1 from public.cashbook_entries where id=old.loan_repayment_entry_id for update;
  if new.amount-old.amount>public.loan_remaining_amount(old.loan_repayment_entry_id)
  then raise exception 'LOAN_REPAYMENT_EXCEEDS_BALANCE'; end if;
 end if;
 select payroll_id into payroll from public.employee_payroll_payments where entry_id=old.id;
 if not found then return new; end if;
 select p.salary into salary from public.employee_payroll p where p.id=payroll for update;
 select coalesce(sum(h.cash_paid+h.deducted),0) into other_paid from pedram_private.employee_payroll_history h
 where h.payroll_id=payroll and h.operation_id<>old.operation_id and not h.reversed;
 if new.amount+other_paid>salary then raise exception 'PAYROLL_EXCEEDS_BALANCE'; end if;
 return new;
end; $$;

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
 ) and not exists (select 1 from pedram_private.payroll_loan_deductions where operation_id=p_operation)
 then raise exception 'INVALID_REVERSAL'; end if;
 select id into reversal from public.cashbook_operations where reverses_id=p_operation;
 if found then return reversal; end if;
 perform 1 from public.cashbook_entries where operation_id=p_operation and loan_due_date is not null for update;
 if exists (select 1 from public.cashbook_entries e where e.operation_id=p_operation and e.loan_due_date is not null
  and public.loan_remaining_amount(e.id)<e.amount) then raise exception 'LOAN_HAS_REPAYMENTS'; end if;

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

commit;
