begin;

-- Staff trader records are editable only by the President. Booking creation
-- still uses the trader directory and can register a new trader atomically.
alter function public.save_trader_record(uuid,uuid,jsonb,timestamptz) set schema pedram_private;
alter function public.trader_account_statement(uuid) set schema pedram_private;
alter function public.add_trader_charge(uuid,jsonb) set schema pedram_private;
alter function public.void_trader_charge(uuid) set schema pedram_private;
alter function public.cashbook_simple_post(uuid,jsonb) set schema pedram_private;
revoke execute on function pedram_private.save_trader_record(uuid,uuid,jsonb,timestamptz),
 pedram_private.trader_account_statement(uuid), pedram_private.add_trader_charge(uuid,jsonb),
 pedram_private.void_trader_charge(uuid), pedram_private.cashbook_simple_post(uuid,jsonb)
 from public, anon, authenticated;

create function public.save_trader_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 return pedram_private.save_trader_record(p_id,p_request,p_data,p_expected);
end; $$;

create function public.trader_account_statement(p_trader uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 return pedram_private.trader_account_statement(p_trader) || jsonb_build_object('bookings', coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',b.id,'number',b.booking_number,'date',b.booking_date,'branch_id',b.branch_id,
   'origin',b.origin,'destination',b.destination,'currency',b.commission_currency,
   'archived',b.archived_at is not null,'deleted',b.deleted_at is not null
  ) order by b.booking_date desc,b.booking_number desc)
  from public.bookings b where b.trader_id=p_trader
 ), '[]'::jsonb));
end; $$;

create function public.add_trader_charge(p_request uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 return pedram_private.add_trader_charge(p_request,p_data);
end; $$;

create function public.void_trader_charge(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 perform pedram_private.void_trader_charge(p_id);
end; $$;

create function public.cashbook_simple_post(p_request uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare booking uuid := nullif(p_data->>'booking_id','')::uuid;
begin
 if booking is not null or nullif(p_data->>'trader_id','') is not null then
  if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 end if;
 if booking is not null and exists (
  select 1 from public.bookings b where b.id=booking
   and (b.deleted_at is not null or (b.commission_currency is not null and b.commission_currency is distinct from p_data->>'currency'))
 ) then
  -- An already committed request can still be retried after record changes.
  if not exists(select 1 from public.cashbook_operations o where o.id=p_request and o.created_by=auth.uid() and o.request_payload=p_data) then
   raise exception 'BOOKING_PAYMENT_UNAVAILABLE';
  end if;
 end if;
 return pedram_private.cashbook_simple_post(p_request,p_data);
end; $$;

drop policy if exists "Branch reads own trader charges" on public.trader_charges;
alter policy "Read accessible entries" on public.cashbook_entries using(public.is_president_user());
alter policy "Read accessible operations" on public.cashbook_operations using(public.is_president_user());

-- Branch cashbooks still reconcile to their ledger totals. Trader and booking
-- payment activity is grouped by account, day and direction for branch staff.
create function public.branch_cashbook_rows()
returns jsonb language sql stable security definer set search_path='' as $$
 with scoped as (
  select e.*, (e.trader_id is not null or e.booking_id is not null) as linked
  from public.cashbook_entries e
  join public.cashbook_accounts a on a.id=e.account_id
  join public.profiles p on p.id=auth.uid() and p.account_enabled
   and p.role='branch_manager' and p.branch_id=a.branch_id
 ), rows as (
  select e.id::text as id,e.account_id,e.entry_date,e.direction,e.amount,e.description,
   false as private_activity,o.receipt_number
  from scoped e join public.cashbook_operations o on o.id=e.operation_id where not e.linked
  union all
  select 'private-'||account_id||'-'||entry_date||'-'||direction,account_id,entry_date,direction,
   sum(amount),null,true,0
  from scoped where linked group by account_id,entry_date,direction
 )
 select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) from rows;
$$;

create or replace function public.booking_finance_rows()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',b.id,'commission_amount',b.commission_amount,'commission_currency',b.commission_currency,
  'freight_amount',b.freight_amount,'carrier_cost',b.carrier_cost,'other_expenses',b.other_expenses
 ) || case when public.is_president_user() then jsonb_build_object(
  'charged',coalesce((select sum(c.amount) from public.trader_charges c where c.booking_id=b.id and c.voided_at is null and c.currency=b.commission_currency),0),
  'paid',coalesce((select sum(case when e.direction='in' then e.amount else -e.amount end)
   from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id
   where e.booking_id=b.id and e.trader_id=b.trader_id and a.currency=b.commission_currency and not e.is_transfer),0)
 ) else '{}'::jsonb end), '[]'::jsonb)
 from public.bookings b where public.operations_access(b.branch_id);
$$;

create function public.reverse_cashbook_entry(p_operation uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 original public.cashbook_operations;
 reversal uuid;
 reason text := btrim(coalesce(p_reason,''));
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if char_length(reason) not between 1 and 500 then raise exception 'REVERSAL_REASON_REQUIRED'; end if;
 select * into original from public.cashbook_operations where id=p_operation for update;
 if not found or original.mode='reversal' or not exists (
  select 1 from public.cashbook_entries where operation_id=p_operation
 ) then raise exception 'INVALID_REVERSAL'; end if;

 -- Lock the original so concurrent submissions produce exactly one reversal.
 select id into reversal from public.cashbook_operations where reverses_id=p_operation;
 if found then return reversal; end if;
 reversal := gen_random_uuid();
 insert into public.cashbook_operations(id,mode,reverses_id,created_by,request_payload)
 values(reversal,'reversal',p_operation,auth.uid(),jsonb_build_object('reason',reason));
 insert into public.cashbook_entries(operation_id,account_id,entry_date,direction,amount,party,
  description,reference,booking_id,trader_id,is_transfer)
 select reversal,account_id,(now() at time zone 'Asia/Kabul')::date,
  case when direction='in' then 'out' else 'in' end,amount,party,
  'Reversal of #'||original.receipt_number||': '||reason,reference,booking_id,trader_id,is_transfer
 from public.cashbook_entries where operation_id=p_operation;
 return reversal;
end; $$;

create function public.fleet_schedule(p_start date,p_days integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare last_day date;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and account_enabled and role in ('president','branch_manager'))
 then raise exception 'ACCESS_DENIED'; end if;
 if p_start is null or not isfinite(p_start) or p_days is null or p_days not between 1 and 31
 then raise exception 'INVALID_DATES'; end if;
 last_day := p_start+p_days-1;
 return (
  with resources as (
   select id,'vehicle' as kind,plate_number as name,status::text as status,permit_expiry as expires
   from public.vehicles where archived_at is null and public.registry_read_access(branch_id)
   union all
   select id,'driver',full_name,status::text,license_expiry
   from public.drivers where archived_at is null and public.registry_read_access(branch_id)
  ), jobs as (
   select r.id as resource_id,r.kind,b.status,coalesce(b.departure_date,b.booking_date) as starts,
    coalesce(b.arrival_date,b.departure_date,b.booking_date) as ends,
    case when public.operations_access(b.branch_id) then b.booking_number end as number,
    case when public.operations_access(b.branch_id) then b.origin end as origin,
    case when public.operations_access(b.branch_id) then b.destination end as destination
   from resources r join public.bookings b on
    (r.kind='vehicle' and b.vehicle_id=r.id) or (r.kind='driver' and b.driver_id=r.id)
   where b.deleted_at is null and b.archived_at is null and b.status in ('confirmed','in_transit')
    and coalesce(b.departure_date,b.booking_date)<=last_day
    and (b.status='in_transit' or coalesce(b.arrival_date,b.departure_date,b.booking_date)>=p_start)
  )
  select jsonb_build_object(
   'resources',coalesce((select jsonb_agg(to_jsonb(resources) order by name) from resources),'[]'::jsonb),
   'jobs',coalesce((select jsonb_agg(to_jsonb(jobs) order by starts) from jobs),'[]'::jsonb)
  )
 );
end; $$;

create function public.operations_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 today date := (now() at time zone 'Asia/Kabul')::date;
 president boolean := public.is_president_user();
 overdue bigint;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and account_enabled and role in ('president','branch_manager'))
 then raise exception 'ACCESS_DENIED'; end if;
 if president then
  -- Apply net receipts to the oldest charges first, separately per currency.
  with aged as (
   select trader_id,currency,sum(amount) as amount from public.trader_charges
   where voided_at is null and charge_date<today-30 group by trader_id,currency
  ), receipts as (
   select e.trader_id,a.currency,sum(case when e.direction='in' then e.amount else -e.amount end) as amount
   from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id
   where e.trader_id is not null and not e.is_transfer and e.entry_date<=today group by e.trader_id,a.currency
  )
  select count(distinct aged.trader_id) into overdue from aged left join receipts using(trader_id,currency)
  where aged.amount>coalesce(receipts.amount,0);
 end if;
 return jsonb_build_object(
  'active', (select count(*) from public.bookings b where b.status='in_transit'
   and b.archived_at is null and b.deleted_at is null and public.operations_access(b.branch_id)),
  'overdue', overdue,
  'cash', coalesce((select jsonb_agg(to_jsonb(cash) order by currency) from (
   select a.currency,coalesce(sum(e.amount) filter(where e.direction='in'),0) as incoming,
    coalesce(sum(e.amount) filter(where e.direction='out'),0) as outgoing
   from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id
   where e.entry_date=today and public.cashbook_access(a.branch_id) group by a.currency
  ) cash), '[]'::jsonb),
  'expiring', (select count(*) from (
   select permit_expiry as expires from public.vehicles where archived_at is null and public.registry_read_access(branch_id)
   union all
   select license_expiry from public.drivers where archived_at is null and public.registry_read_access(branch_id)
   union all
   select doc.expires_on from public.vehicle_documents doc
   left join public.vehicles v on v.id=doc.vehicle_id
   left join public.drivers d on d.id=doc.driver_id
   left join public.vehicle_owners o on o.id=doc.owner_id
   where doc.state='ready' and (
    (v.id is not null and v.archived_at is null and public.operations_access(v.branch_id)) or
    (d.id is not null and d.archived_at is null and public.operations_access(d.branch_id)) or
    (o.id is not null and o.archived_at is null and public.operations_access(o.branch_id)))
  ) documents where expires between today and today+30)
 );
end; $$;

revoke execute on function public.save_trader_record(uuid,uuid,jsonb,timestamptz),
 public.trader_account_statement(uuid),public.add_trader_charge(uuid,jsonb),public.void_trader_charge(uuid),
 public.cashbook_simple_post(uuid,jsonb),public.branch_cashbook_rows(),
 public.reverse_cashbook_entry(uuid,text),public.fleet_schedule(date,integer),public.operations_summary()
 from public,anon;
grant execute on function public.save_trader_record(uuid,uuid,jsonb,timestamptz),
 public.trader_account_statement(uuid),public.add_trader_charge(uuid,jsonb),public.void_trader_charge(uuid),
 public.cashbook_simple_post(uuid,jsonb),public.branch_cashbook_rows(),
 public.reverse_cashbook_entry(uuid,text),public.fleet_schedule(date,integer),public.operations_summary()
 to authenticated;
commit;
