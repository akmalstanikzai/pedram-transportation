begin;

create table pedram_private.office_expenses (
 id uuid primary key,
 branch_id uuid references public.branches(id),
 category text not null check (category in ('food','electricity','rent','fuel','maintenance','internet','supplies','other')),
 currency text not null check (currency in ('AFN','USD','PKR','IRR')),
 description text not null check (char_length(btrim(description)) between 1 and 500),
 recorded_on date not null,
 due_on date,
 amount numeric(14,2) not null check (amount > 0),
 created_by uuid not null references auth.users(id)
);
create table pedram_private.office_expense_payments (
 operation_id uuid primary key references public.cashbook_operations(id),
 expense_id uuid not null references pedram_private.office_expenses(id)
);
create index on pedram_private.office_expense_payments(expense_id);
revoke all on pedram_private.office_expenses,pedram_private.office_expense_payments from public,anon,authenticated;

create view pedram_private.expense_cashbook_rows as
select e.id,e.operation_id,o.receipt_number,a.branch_id,a.currency,e.entry_date,e.direction,e.amount,e.description,
 p.expense_id,coalesce(x.category,
 case when ep.entry_id is not null then 'salary' else 'shipment' end) as category
from public.cashbook_entries e
join public.cashbook_accounts a on a.id=e.account_id
join public.cashbook_operations o on o.id=e.operation_id
left join pedram_private.office_expense_payments p on p.operation_id=coalesce(o.reverses_id,o.id)
left join pedram_private.office_expenses x on x.id=p.expense_id
left join public.cashbook_entries original on original.operation_id=coalesce(o.reverses_id,o.id) and original.account_id=e.account_id
left join public.employee_payroll_payments ep on ep.entry_id=original.id
where p.expense_id is not null or ep.entry_id is not null
 or exists(select 1 from pedram_private.managed_expense_receipts m where m.operation_id=original.operation_id)
 or exists(select 1 from public.customs_agent_payments c where c.entry_id=original.id);
revoke all on pedram_private.expense_cashbook_rows from public,anon,authenticated;

create function public.save_office_expense(
 p_request uuid,p_branch uuid,p_category text,p_currency text,p_description text,
 p_date date,p_amount numeric,p_due date default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior pedram_private.office_expenses;
begin
 if not public.operations_access(p_branch) then raise exception 'ACCESS_DENIED'; end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2)
 then raise exception 'INVALID_AMOUNT'; end if;
 if p_date is null or not isfinite(p_date) or p_date>(now() at time zone 'Asia/Kabul')::date
 or (p_due is not null and (not isfinite(p_due) or p_due<p_date)) then raise exception 'INVALID_DATE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from pedram_private.office_expenses where id=p_request;
 if found then
  if (prior.created_by,prior.branch_id,prior.category,prior.currency,prior.description,prior.recorded_on,prior.amount,prior.due_on)
   is distinct from (auth.uid(),p_branch,p_category,p_currency,btrim(p_description),p_date,p_amount,p_due)
  then raise exception 'REQUEST_CONFLICT'; end if;
  return prior.id;
 end if;
 insert into pedram_private.office_expenses values
 (p_request,p_branch,p_category,p_currency,btrim(p_description),p_date,p_due,p_amount,auth.uid());
 if p_due is null then
  perform public.cashbook_simple_post(p_request,jsonb_build_object('branch_id',p_branch,'direction','out',
   'currency',p_currency,'description',btrim(p_description),'date',p_date,'amount',p_amount));
  insert into pedram_private.office_expense_payments values(p_request,p_request);
 end if;
 return p_request;
end; $$;

create view pedram_private.office_bills_due as
select x.*, greatest(x.amount-coalesce((
 select sum(case when r.direction='out' then r.amount else -r.amount end)
 from pedram_private.expense_cashbook_rows r where r.expense_id=x.id
),0),0) as remaining
from pedram_private.office_expenses x where x.due_on is not null;
revoke all on pedram_private.office_bills_due from public,anon,authenticated;

create function pedram_private.guard_office_bill_correction() returns trigger
language plpgsql security definer set search_path='' as $$
declare bill_id uuid;
begin
 select p.expense_id into bill_id
 from pedram_private.office_expense_payments p join pedram_private.office_expenses x on x.id=p.expense_id
 where p.operation_id=old.operation_id and x.due_on is not null for update of x;
 if found and new.amount>old.amount+(select remaining from pedram_private.office_bills_due where id=bill_id)
 then raise exception 'INVALID_AMOUNT'; end if;
 return new;
end; $$;
revoke all on function pedram_private.guard_office_bill_correction() from public,anon,authenticated;
create trigger guard_office_bill_correction before update of amount on public.cashbook_entries
for each row when (old.amount is distinct from new.amount)
execute function pedram_private.guard_office_bill_correction();

create function public.pay_office_bill(p_request uuid,p_bill uuid,p_date date,p_amount numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare bill pedram_private.office_expenses; payload jsonb;
begin
 select * into bill from pedram_private.office_expenses where id=p_bill for update;
 if not found or bill.due_on is null or not public.operations_access(bill.branch_id)
 then raise exception 'ACCESS_DENIED'; end if;
 if p_date is null or p_date<bill.recorded_on then raise exception 'INVALID_DATE'; end if;
 payload:=jsonb_build_object('branch_id',bill.branch_id,'direction','out','currency',bill.currency,
  'description',bill.description,'date',p_date,'amount',p_amount);
 if exists(select 1 from pedram_private.office_expense_payments p where p.operation_id=p_request and p.expense_id=p_bill) then
  return public.cashbook_simple_post(p_request,payload);
 end if;
 if p_amount is null or p_amount<=0 or p_amount>(select remaining from pedram_private.office_bills_due where id=p_bill)
 then raise exception 'INVALID_AMOUNT'; end if;
 perform public.cashbook_simple_post(p_request,payload);
 insert into pedram_private.office_expense_payments values(p_request,p_bill);
 return p_request;
end; $$;

create function public.company_expenses(p_all boolean,p_branch uuid,p_start date,p_end date)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'payments',coalesce((select jsonb_agg(to_jsonb(r) order by r.entry_date desc,r.receipt_number desc)
 from pedram_private.expense_cashbook_rows r
 where public.cashbook_access(r.branch_id) and (p_all or r.branch_id is not distinct from p_branch)
 and r.entry_date between p_start and p_end and (r.category<>'salary' or public.is_president_user())), '[]'::jsonb),
 'bills',coalesce((select jsonb_agg(to_jsonb(b)-'created_by' order by b.due_on,b.id)
 from pedram_private.office_bills_due b
 where public.cashbook_access(b.branch_id) and (p_all or b.branch_id is not distinct from p_branch)
 and b.remaining>0),'[]'::jsonb));
$$;

revoke all on function public.save_office_expense(uuid,uuid,text,text,text,date,numeric,date),
 public.pay_office_bill(uuid,uuid,date,numeric),public.company_expenses(boolean,uuid,date,date) from public,anon;
grant execute on function public.save_office_expense(uuid,uuid,text,text,text,date,numeric,date),
 public.pay_office_bill(uuid,uuid,date,numeric),public.company_expenses(boolean,uuid,date,date) to authenticated;

create function public.company_overview(p_all boolean,p_branch uuid,p_start date)
returns jsonb language sql stable security definer set search_path='' as $$
 with params as (select (now() at time zone 'Asia/Kabul')::date as today),
 accounts as (
  select a.* from public.cashbook_accounts a where public.cashbook_access(a.branch_id)
  and (p_all or a.branch_id is not distinct from p_branch)
 ), entries as (
  select e.*,a.currency from public.cashbook_entries e join accounts a on a.id=e.account_id
  where e.entry_date<=(select today from params)
 ), bookings as (
  select b.* from public.bookings b where public.operations_access(b.branch_id)
  and (p_all or b.branch_id is not distinct from p_branch) and b.deleted_at is null and b.archived_at is null
 ), trader_items as (
  select c.trader_id,c.currency,c.amount from public.trader_charges c
  where public.is_president_user() and c.voided_at is null
   and c.charge_date<=(select today from params) and (p_all or c.branch_id is not distinct from p_branch)
  union all
  select trader_id,currency,case direction when 'in' then -amount else amount end
  from entries where public.is_president_user() and trader_id is not null and not is_transfer
 ), trader_balances as (
  select currency,trader_id,sum(amount) as balance from trader_items group by currency,trader_id
 ), resources as (
  select d.id,'driver' as kind,d.status::text,d.license_expiry as expiry from public.drivers d
  where d.archived_at is null and public.registry_read_access(d.branch_id)
   and (p_all or d.branch_id is null or d.branch_id=p_branch)
  union all
  select v.id,'vehicle',v.status::text,v.permit_expiry from public.vehicles v
  where v.archived_at is null and public.registry_read_access(v.branch_id)
   and (p_all or v.branch_id is null or v.branch_id=p_branch)
 ), availability as (
  select r.*,r.status='available' and (r.expiry is null or r.expiry>=p.today)
   and not exists(select 1 from pedram_private.booking_legs l
    where r.id=case when r.kind='vehicle' then l.vehicle_id else l.driver_id end
    and l.status in ('confirmed','in_transit') and l.departure_date<=p.today
    and (l.status='in_transit' or l.arrival_date>=p.today)) as available
   from resources r cross join params p
 )
 select jsonb_build_object(
 'operations',jsonb_build_object(
  'waiting',(select count(*) from bookings where status='confirmed'),
  'road',(select count(*) from bookings where status='in_transit' and
   (case when handoff_confirmed_at is not null then onward_driver_delivered_at else driver_delivered_at end) is null),
  'delivery',(select count(*) from bookings where status='in_transit' and
   (case when handoff_confirmed_at is not null then onward_driver_delivered_at else driver_delivered_at end) is not null),
  'drivers',(select count(*) from availability where kind='driver' and status<>'inactive'),
  'availableDrivers',(select count(*) from availability where kind='driver' and available),
  'availableVehicles',(select count(*) from availability where kind='vehicle' and available),
  'branches',(select count(*) from public.branches b where b.archived_at is null
   and public.operations_access(b.id) and (p_all or b.id=p_branch))),
 'money',(select jsonb_agg(jsonb_build_object('currency',c.currency,
  'cash',coalesce((select sum(opening_balance) from accounts a where a.currency=c.currency and a.opening_date<=p.today),0)
   +coalesce((select sum(case direction when 'in' then amount else -amount end) from entries e where e.currency=c.currency),0),
  'incoming',coalesce((select sum(amount) from entries e where e.currency=c.currency and entry_date>=p_start and direction='in'),0),
  'outgoing',coalesce((select sum(amount) from entries e where e.currency=c.currency and entry_date>=p_start and direction='out'),0),
  'trader',case when public.is_president_user() then coalesce((select sum(greatest(balance,0)) from trader_balances t where t.currency=c.currency),0) end,
  'driver',case when public.is_president_user() then coalesce((select sum(greatest(d.total-d.trader_paid-d.paid,0))
   from pedram_private.driver_commission_balances d join bookings b on b.id=d.booking_id where d.currency=c.currency),0) end,
  'customs',case when public.is_president_user() then coalesce((select sum(greatest(f.amount-pedram_private.customs_fee_paid(f.id),0))
   from public.customs_agent_fees f left join public.bookings b on b.id=f.booking_id
   where f.currency=c.currency and f.fee_date<=p.today and (p_all or (f.booking_id is not null and b.branch_id is not distinct from p_branch))),0) end,
  'payroll',case when public.is_president_user() and p_all and c.currency='AFN' then coalesce((
   select sum(greatest(s.salary-coalesce((select sum(h.cash_paid+h.deducted)
    from pedram_private.employee_payroll_history h where h.payroll_id=s.id and not h.reversed),0),0))
   from public.employee_payroll s),0) end,
  'bills',coalesce((select sum(remaining) from pedram_private.office_bills_due b
   where b.currency=c.currency and public.cashbook_access(b.branch_id) and (p_all or b.branch_id is not distinct from p_branch)),0),
  'expenses',coalesce((select sum(case direction when 'out' then amount else -amount end)
   from pedram_private.expense_cashbook_rows r where r.currency=c.currency and public.cashbook_access(r.branch_id)
   and (p_all or r.branch_id is not distinct from p_branch) and r.entry_date between p_start and p.today
   and (r.category<>'salary' or public.is_president_user())),0)
 ) order by c.number) from (values ('AFN',1),('USD',2),('PKR',3),('IRR',4)) c(currency,number) cross join params p)
 )
 where exists(select 1 from public.profiles u where u.id=auth.uid() and u.account_enabled and u.role in ('president','branch_manager'));
$$;
revoke all on function public.company_overview(boolean,uuid,date) from public,anon;
grant execute on function public.company_overview(boolean,uuid,date) to authenticated;

commit;
