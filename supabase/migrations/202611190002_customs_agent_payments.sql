begin;

create table public.customs_agent_fees (
  id uuid primary key,
  agent_id uuid not null references public.customs_agents(id),
  booking_id uuid references public.bookings(id),
  fee_date date not null,
  currency text not null check (currency in ('AFN','USD','PKR','IRR')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null check (char_length(description) between 1 and 500),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index customs_agent_fees_agent_idx on public.customs_agent_fees(agent_id,fee_date);

create table public.customs_agent_payments (
  entry_id uuid primary key references public.cashbook_entries(id),
  fee_id uuid not null references public.customs_agent_fees(id),
  booking_id uuid references public.bookings(id)
);
create index customs_agent_payments_fee_idx on public.customs_agent_payments(fee_id);
alter table public.customs_agent_fees enable row level security;
alter table public.customs_agent_payments enable row level security;
revoke all on public.customs_agent_fees,public.customs_agent_payments from public,anon,authenticated;

create function pedram_private.customs_fee_paid(p_fee uuid,p_exclude uuid default null) returns numeric
language sql stable set search_path='' as $$
  select coalesce(sum(e.amount),0)
  from public.customs_agent_payments p join public.cashbook_entries e on e.id=p.entry_id
  where p.fee_id=p_fee and e.id is distinct from p_exclude
  and not exists(select 1 from public.cashbook_operations r where r.reverses_id=e.operation_id);
$$;
revoke all on function pedram_private.customs_fee_paid(uuid,uuid) from public,anon,authenticated;

create function public.add_customs_agent_fee(
  p_request uuid,p_agent uuid,p_date date,p_currency text,p_amount numeric,p_description text,p_booking uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.customs_agent_fees; details text := btrim(coalesce(p_description,''));
begin
  if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
  if p_request is null then raise exception 'INVALID_ENTRY'; end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2) then raise exception 'INVALID_AMOUNT'; end if;
  if p_currency is null or p_currency not in ('AFN','USD','PKR','IRR') then raise exception 'INVALID_ENTRY'; end if;
  if p_date is null or p_date>(now() at time zone 'Asia/Kabul')::date then raise exception 'INVALID_DATE'; end if;
  if char_length(details) not between 1 and 500 then raise exception 'DESCRIPTION_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into prior from public.customs_agent_fees where id=p_request;
  if found then
    if (prior.created_by,prior.agent_id,prior.fee_date,prior.currency,prior.amount,prior.description,prior.booking_id)
       is distinct from (auth.uid(),p_agent,p_date,p_currency,p_amount,details,p_booking)
    then raise exception 'REQUEST_CONFLICT'; end if;
    return prior.id;
  end if;
  if not exists(select 1 from public.customs_agents where id=p_agent) then raise exception 'CUSTOMS_AGENT_UNAVAILABLE'; end if;
  if p_booking is not null and not exists(select 1 from public.bookings where id=p_booking and deleted_at is null)
    then raise exception 'CUSTOMS_BOOKING_UNAVAILABLE'; end if;
  insert into public.customs_agent_fees(id,agent_id,booking_id,fee_date,currency,amount,description,created_by)
  values(p_request,p_agent,p_booking,p_date,p_currency,p_amount,details,auth.uid());
  return p_request;
end; $$;

create function public.pay_customs_agent_fee(
  p_request uuid,p_fee uuid,p_branch uuid,p_date date,p_currency text,p_amount numeric,p_description text,p_booking uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  fee public.customs_agent_fees; prior public.cashbook_operations; payload jsonb;
  details text := btrim(coalesce(p_description,'')); booking uuid; receipt_entry uuid;
begin
  if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
  if p_request is null then raise exception 'INVALID_ENTRY'; end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2) then raise exception 'INVALID_AMOUNT'; end if;
  if char_length(details) not between 1 and 500 then raise exception 'DESCRIPTION_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into fee from public.customs_agent_fees where id=p_fee for update;
  if not found then raise exception 'CUSTOMS_FEE_UNAVAILABLE'; end if;
  if p_currency is distinct from fee.currency then raise exception 'CUSTOMS_CURRENCY_MISMATCH'; end if;
  if fee.booking_id is not null and p_booking is not null and p_booking<>fee.booking_id
    then raise exception 'CUSTOMS_BOOKING_UNAVAILABLE'; end if;
  booking := coalesce(fee.booking_id,p_booking);
  -- Keep this reference separate from booking receivables and trader payments.
  payload := jsonb_build_object('branch_id',p_branch,'direction','out','currency',p_currency,'amount',p_amount,'date',p_date,
    'customs_fee_id',p_fee,'customs_booking_id',booking,'customs_payment_note',details);
  select * into prior from public.cashbook_operations where id=p_request;
  if found then
    if prior.created_by is distinct from auth.uid() or (prior.request_payload-'description') is distinct from payload
      or not exists(select 1 from public.customs_agent_payments p join public.cashbook_entries e on e.id=p.entry_id
        where p.fee_id=p_fee and e.operation_id=prior.id)
      then raise exception 'REQUEST_CONFLICT'; end if;
    return prior.id;
  end if;
  if p_date is null or p_date<fee.fee_date or p_date>(now() at time zone 'Asia/Kabul')::date
    then raise exception 'CUSTOMS_PAYMENT_DATE'; end if;
  if p_branch is not null and not exists(select 1 from public.branches where id=p_branch and archived_at is null)
    then raise exception 'ACCESS_DENIED'; end if;
  if p_booking is not null and fee.booking_id is null and not exists(select 1 from public.bookings where id=p_booking and deleted_at is null)
    then raise exception 'CUSTOMS_BOOKING_UNAVAILABLE'; end if;
  if p_amount>fee.amount-pedram_private.customs_fee_paid(fee.id) then raise exception 'CUSTOMS_EXCEEDS_BALANCE'; end if;
  payload := payload || jsonb_build_object('description',
    'کمیشن کار · '||(select name from public.customs_agents where id=fee.agent_id)
    ||coalesce(' · بار نامه #'||(select booking_number from public.bookings where id=booking),'')||' · '||details);
  perform public.cashbook_simple_post(p_request,payload);
  select id into strict receipt_entry from public.cashbook_entries where operation_id=p_request;
  insert into public.customs_agent_payments(entry_id,fee_id,booking_id) values(receipt_entry,fee.id,booking);
  return p_request;
end; $$;

create function pedram_private.guard_customs_payment_amount() returns trigger
language plpgsql security definer set search_path='' as $$
declare fee public.customs_agent_fees;
begin
  select f.* into fee from public.customs_agent_fees f join public.customs_agent_payments p on p.fee_id=f.id
  where p.entry_id=old.id for update of f;
  if not found then return new; end if;
  if new.amount+pedram_private.customs_fee_paid(fee.id,old.id)>fee.amount
    then raise exception 'CUSTOMS_EXCEEDS_BALANCE'; end if;
  return new;
end; $$;
create trigger cashbook_customs_amount_guard before update of amount on public.cashbook_entries
for each row when (old.amount is distinct from new.amount) execute function pedram_private.guard_customs_payment_amount();
revoke all on function pedram_private.guard_customs_payment_amount() from public,anon,authenticated;

create function public.customs_agent_statement(p_agent uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
  if not exists(select 1 from public.customs_agents where id=p_agent) then raise exception 'CUSTOMS_AGENT_UNAVAILABLE'; end if;
  return jsonb_build_object(
    'fees',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'date',f.fee_date,'currency',f.currency,'amount',f.amount,'description',f.description,
      'booking_number',b.booking_number,'paid',totals.paid,'remaining',f.amount-totals.paid
    ) order by f.fee_date desc,f.created_at desc,f.id)
    from public.customs_agent_fees f left join public.bookings b on b.id=f.booking_id
    cross join lateral (select pedram_private.customs_fee_paid(f.id) as paid) totals
    where f.agent_id=p_agent),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'date',e.entry_date,'direction',e.direction,'amount',e.amount,'currency',a.currency,
      'branch',b.name,'receipt_number',o.receipt_number,'description',e.description,'booking_number',bk.booking_number,
      'reversal',o.mode='reversal','reverses_receipt',case when o.reverses_id is not null then orig.receipt_number end,
      'reversed_by',(select r.receipt_number from public.cashbook_operations r where r.reverses_id=o.id),
      'corrected',exists(select 1 from public.cashbook_amount_corrections c where c.entry_id=e.id)
    ) order by e.entry_date desc,o.receipt_number desc)
    from public.customs_agent_fees f join public.customs_agent_payments p on p.fee_id=f.id
    join public.cashbook_entries original on original.id=p.entry_id
    join public.cashbook_operations orig on orig.id=original.operation_id
    join public.cashbook_operations o on o.id=orig.id or o.reverses_id=orig.id
    join public.cashbook_entries e on e.operation_id=o.id
    join public.cashbook_accounts a on a.id=e.account_id
    left join public.branches b on b.id=a.branch_id
    left join public.bookings bk on bk.id=p.booking_id
    where f.agent_id=p_agent),'[]'::jsonb)
  );
end; $$;

-- Branches can reconcile their own cash movement without opening Customs data.
create or replace function public.branch_cashbook_rows()
returns jsonb language sql stable security definer set search_path='' as $$
  with scoped as (
    select e.*, o.receipt_number,
      (e.trader_id is not null or e.booking_id is not null) as linked,
      exists(select 1 from public.customs_agent_payments cp
        join public.cashbook_entries original on original.id=cp.entry_id
        where original.operation_id=coalesce(o.reverses_id,o.id)) as customs_payment
    from public.cashbook_entries e
    join public.cashbook_operations o on o.id=e.operation_id
    join public.cashbook_accounts a on a.id=e.account_id
    join public.profiles p on p.id=auth.uid() and p.account_enabled
      and p.role='branch_manager' and p.branch_id=a.branch_id
  ), rows as (
    select e.id::text as id,e.account_id,e.entry_date,e.direction,e.amount,
      case when e.customs_payment and e.direction='out' then 'پرداخت کمیشن کار'
           when e.customs_payment then 'معامله معکوس پرداخت کمیشن کار'
           else e.description end as description,
      false as private_activity,e.receipt_number
    from scoped e where not e.linked
    union all
    select 'private-'||account_id||'-'||entry_date||'-'||direction,account_id,entry_date,direction,
      sum(amount),null,true,0
    from scoped where linked group by account_id,entry_date,direction
  )
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) from rows;
$$;

revoke all on function public.add_customs_agent_fee(uuid,uuid,date,text,numeric,text,uuid),
  public.pay_customs_agent_fee(uuid,uuid,uuid,date,text,numeric,text,uuid),public.customs_agent_statement(uuid) from public,anon;
grant execute on function public.add_customs_agent_fee(uuid,uuid,date,text,numeric,text,uuid),
  public.pay_customs_agent_fee(uuid,uuid,uuid,date,text,numeric,text,uuid),public.customs_agent_statement(uuid) to authenticated;
commit;
