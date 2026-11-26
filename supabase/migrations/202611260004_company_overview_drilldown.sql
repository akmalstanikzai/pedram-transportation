begin;

create view pedram_private.company_payment_movements as
select e.id,a.branch_id,a.currency,e.entry_date,e.direction,e.amount,
 case when c.managed_charge_key='foreign_freight' then 'foreignFreight' else 'traderOut' end as metric
from public.cashbook_entries e
join public.cashbook_accounts a on a.id=e.account_id
join public.cashbook_operations o on o.id=e.operation_id
left join pedram_private.managed_expense_receipts m on m.operation_id=coalesce(o.reverses_id,o.id)
left join public.trader_charges c on c.id=m.charge_id
where c.managed_charge_key='foreign_freight'
 or (e.trader_id is not null and not e.is_transfer and (e.direction='out'
  or (o.reverses_id is not null and exists(
   select 1 from public.cashbook_entries original
   where original.operation_id=o.reverses_id and original.account_id=e.account_id and original.direction='out'
  ))));
revoke all on pedram_private.company_payment_movements from public,anon,authenticated;

alter function public.company_overview(boolean,uuid,date) set schema pedram_private;
revoke all on function pedram_private.company_overview(boolean,uuid,date) from public,anon,authenticated;
create function public.company_overview(p_all boolean,p_branch uuid,p_start date)
returns jsonb language sql stable security definer set search_path='' as $$
 with overview as (
  select pedram_private.company_overview(p_all,p_branch,p_start) as data
 ), totals as (
  select metric,currency,sum(case direction when 'out' then amount else -amount end) as net
  from pedram_private.company_payment_movements
  where public.cashbook_access(branch_id) and (p_all or branch_id is not distinct from p_branch)
   and entry_date between p_start and (now() at time zone 'Asia/Kabul')::date
   and (metric='foreignFreight' or public.is_president_user())
  group by metric,currency
 )
 select data || jsonb_build_object('money',(
  select jsonb_agg(row || jsonb_build_object(
   'foreignFreight',coalesce(f.net,0),
   'traderOut',case when public.is_president_user() then coalesce(t.net,0) end
  ) order by ordinal)
  from jsonb_array_elements(data->'money') with ordinality as c(row,ordinal)
  left join totals f on f.currency=c.row->>'currency' and f.metric='foreignFreight'
  left join totals t on t.currency=c.row->>'currency' and t.metric='traderOut'
 ))
 from overview where data is not null;
$$;
revoke all on function public.company_overview(boolean,uuid,date) from public,anon;
grant execute on function public.company_overview(boolean,uuid,date) to authenticated;

-- Return the records that contribute to the selected figure. Branch cashbook
-- entries use the same redacted feed as Cashbook itself.
create function public.company_financial_details(
 p_metric text,p_all boolean,p_branch uuid,p_currency text,p_start date,p_offset integer default 0
) returns jsonb language sql stable security definer set search_path='' as $$
 with params as (
  select (now() at time zone 'Asia/Kabul')::date as today, public.is_president_user() as president
 ), accounts as (
  select a.* from public.cashbook_accounts a where public.cashbook_access(a.branch_id)
   and (p_all or a.branch_id is not distinct from p_branch) and a.currency=p_currency
 ), entries as (
  select e.* from public.cashbook_entries e join accounts a on a.id=e.account_id
  where e.entry_date<=(select today from params)
 ), trader_items as (
  select c.trader_id,c.amount from public.trader_charges c
  where p_metric='trader' and (select president from params) and c.voided_at is null
   and c.charge_date<=(select today from params) and c.currency=p_currency
   and (p_all or c.branch_id is not distinct from p_branch)
  union all
  select trader_id,case direction when 'in' then -amount else amount end
  from entries where p_metric='trader' and (select president from params) and trader_id is not null and not is_transfer
 ), obligations as (
  select t.id as id,t.full_name as label,sum(i.amount) as amount,
   null::date as date,null::uuid as related_id,null::uuid as branch_id,
   null::bigint as number,null::int as year,null::int as month
  from trader_items i join public.traders t on t.id=i.trader_id group by t.id having sum(i.amount)>0
  union all
  select b.id,coalesce(d.full_name,'#'||b.booking_number),f.total-f.trader_paid-f.paid,
   b.booking_date,b.driver_id,b.branch_id,b.booking_number,null,null
  from pedram_private.driver_commission_balances f join public.bookings b on b.id=f.booking_id
  left join public.drivers d on d.id=f.driver_id
  where p_metric='driver' and (select president from params) and f.currency=p_currency
   and b.deleted_at is null and b.archived_at is null and public.operations_access(b.branch_id)
   and (p_all or b.branch_id is not distinct from p_branch)
  union all
  select p.id,concat_ws(' ',e.first_name,e.last_name),p.salary-coalesce((
    select sum(h.cash_paid+h.deducted) from pedram_private.employee_payroll_history h
    where h.payroll_id=p.id and not h.reversed),0),null,e.id,null,null,p.payroll_year,p.payroll_month
  from public.employee_payroll p join public.employees e on e.id=p.employee_id
  where p_metric='payroll' and (select president from params) and p_all and p_currency='AFN'
  union all
  select f.id,f.description,f.amount-pedram_private.customs_fee_paid(f.id),f.fee_date,f.agent_id,b.branch_id,b.booking_number,null,null
  from public.customs_agent_fees f left join public.bookings b on b.id=f.booking_id
  where p_metric='customs' and (select president from params) and f.currency=p_currency
   and f.fee_date<=(select today from params) and (p_all or (f.booking_id is not null and b.branch_id is not distinct from p_branch))
 ), cash as (
  select e.id::text,e.description as label,e.amount,e.entry_date as date,a.branch_id,o.receipt_number as number,e.direction
  from entries e join accounts a on a.id=e.account_id join public.cashbook_operations o on o.id=e.operation_id
  where p_metric in ('incoming','outgoing','cash') and (select president from params)
  union all
  select e.id,e.description,e.amount,e.entry_date,a.branch_id,e.receipt_number,e.direction
  from jsonb_to_recordset(case when p_metric in ('incoming','outgoing','cash') and not (select president from params)
   then public.branch_cashbook_rows() else '[]'::jsonb end)
   as e(id text,description text,amount numeric,entry_date date,account_id uuid,receipt_number bigint,direction text)
  join accounts a on a.id=e.account_id where e.entry_date<=(select today from params)
 ), rows as (
  select id::text,label,amount,date,related_id,branch_id,number,year,month,null::text as direction
  from obligations where amount>0
  union all
  select id,label,amount,date,null,branch_id,number,null,null,direction
  from cash where p_metric='cash' or (date>=p_start and direction=case p_metric when 'incoming' then 'in' else 'out' end)
  union all
  select a.id::text,null,a.opening_balance,a.opening_date,null,a.branch_id,null,null,null,'opening'
  from accounts a where p_metric='cash' and a.opening_balance<>0 and a.opening_date<=(select today from params)
  union all
  select m.id::text,e.description,m.amount,m.entry_date,null,m.branch_id,o.receipt_number,null,null,m.direction
  from pedram_private.company_payment_movements m join entries e on e.id=m.id
  join public.cashbook_operations o on o.id=e.operation_id
  where m.metric=p_metric and m.entry_date>=p_start
   and (m.metric='foreignFreight' or (select president from params))
 ), page as (
  select * from rows order by year desc nulls last,month desc nulls last,date desc nulls last,amount desc,id
  limit 21 offset greatest(coalesce(p_offset,0),0)
 )
 select coalesce(jsonb_agg(to_jsonb(page)), '[]'::jsonb) from page;
$$;

-- Keep the trader account in the same branch scope as the originating total.
create function public.company_trader_statement(p_trader uuid,p_branch uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare statement jsonb;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 statement:=public.trader_account_statement(p_trader);
 return jsonb_build_object(
  'charges',coalesce((select jsonb_agg(c) from jsonb_array_elements(statement->'charges') c
   where (c->>'branch_id')::uuid is not distinct from p_branch),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(p) from jsonb_array_elements(statement->'payments') p
   join public.cashbook_entries e on e.id=(p->>'id')::uuid join public.cashbook_accounts a on a.id=e.account_id
   where a.branch_id is not distinct from p_branch),'[]'::jsonb),
  'bookings',coalesce((select jsonb_agg(b) from jsonb_array_elements(statement->'bookings') b
   where (b->>'branch_id')::uuid is not distinct from p_branch),'[]'::jsonb)
 );
end; $$;

revoke all on function public.company_financial_details(text,boolean,uuid,text,date,integer),
 public.company_trader_statement(uuid,uuid) from public,anon;
grant execute on function public.company_financial_details(text,boolean,uuid,text,date,integer),
 public.company_trader_statement(uuid,uuid) to authenticated;

commit;
