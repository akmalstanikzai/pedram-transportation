begin;
alter table public.bookings add column if not exists quantity_unit text check(quantity_unit in ('tons','pieces','m3'));
alter table public.bookings add column if not exists quantity_amount numeric(12,3) check(quantity_amount>0);
alter table public.bookings add column if not exists receiver_is_trader boolean not null default false;
grant select(quantity_unit,quantity_amount,receiver_is_trader) on public.bookings to authenticated;
create or replace function public.save_booking_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; trader uuid; vehicle public.vehicles; driver public.drivers; old public.bookings; prior uuid;
 result uuid:=coalesce(p_id,gen_random_uuid()); day date; starts date; ends date; weight numeric; volume numeric;
 payload jsonb:=jsonb_build_object('id',p_id,'data',p_data); actor_role public.app_role;
begin
 select p.role into actor_role from public.profiles p where id=auth.uid() and account_enabled;
 if actor_role is null or actor_role not in ('president','vice_president','branch_manager') then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'booking',payload); if prior is not null then return prior; end if;
 bid:=nullif(p_data->>'branch_id','')::uuid;
 if actor_role='branch_manager' then select branch_id into bid from public.profiles where id=auth.uid(); end if;
 if not public.operations_access(bid) or (bid is not null and not exists(select 1 from public.branches where id=bid and archived_at is null)) then raise exception 'ACCESS_DENIED'; end if;
 if p_id is not null then
  select * into old from public.bookings where id=p_id for update;
  if not found or not public.operations_access(old.branch_id) or bid is distinct from old.branch_id then raise exception 'ACCESS_DENIED'; end if;
  if p_expected is null or old.updated_at<>p_expected then raise exception 'STALE_RECORD'; end if;
  if old.status<>'confirmed' or old.archived_at is not null then raise exception 'RECORD_LOCKED'; end if;
 end if;
 if exists(select 1 from unnest(array['trader_first_name','trader_phone','trader_address','sender_name','sender_phone','sender_address','receiver_name','receiver_phone','receiver_address','origin','destination','goods']) key where coalesce(trim(p_data->>key),'')='') or p_data->>'service_type' not in ('arrangement','managed') or p_data->>'service_type' is null then raise exception 'REQUIRED_FIELDS'; end if;
 day:=nullif(p_data->>'booking_date','')::date; starts:=day; ends:=day;
 if day is null or starts is null or ends is null or starts<day or ends<starts then raise exception 'INVALID_DATES'; end if;
 weight:=case when p_data->>'quantity_unit'='tons' then nullif(p_data->>'quantity_amount','')::numeric end; volume:=case when p_data->>'quantity_unit'='m3' then nullif(p_data->>'quantity_amount','')::numeric end;
 if p_data->>'quantity_unit' not in ('tons','pieces','m3') or nullif(p_data->>'quantity_amount','')::numeric is null or nullif(p_data->>'quantity_amount','')::numeric<=0 or nullif(p_data->>'quantity_amount','')::numeric<>round(nullif(p_data->>'quantity_amount','')::numeric,3) or (p_data->>'quantity_unit'='pieces' and nullif(p_data->>'quantity_amount','')::numeric<>trunc(nullif(p_data->>'quantity_amount','')::numeric)) then raise exception 'INVALID_MEASUREMENT'; end if;
 -- Row locks serialize conflicting reservations, even with different request IDs.
 perform 1 from public.vehicles where id=nullif(p_data->>'vehicle_id','')::uuid for update;
 perform 1 from public.drivers where id=nullif(p_data->>'driver_id','')::uuid for update;
 select * into vehicle from public.vehicles where id=nullif(p_data->>'vehicle_id','')::uuid;
 select * into driver from public.drivers where id=nullif(p_data->>'driver_id','')::uuid;
 if vehicle.id is null or driver.id is null or (vehicle.branch_id is not null and vehicle.branch_id is distinct from bid) or (driver.branch_id is not null and driver.branch_id is distinct from bid) or vehicle.archived_at is not null or driver.archived_at is not null or vehicle.status in ('inactive','under_repair','on_trip','assigned') or driver.status<>'available' or not exists(select 1 from public.vehicle_owners where id=vehicle.owner_id and archived_at is null) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
 if vehicle.permit_expiry<ends or driver.license_expiry<ends then raise exception 'DOCUMENT_EXPIRED'; end if;
 if weight is not null and vehicle.capacity_tons is null then raise exception 'CAPACITY_REQUIRED'; end if;
 if volume is not null and vehicle.volume_capacity_m3 is null then raise exception 'VOLUME_CAPACITY_REQUIRED'; end if;
 if volume>vehicle.volume_capacity_m3 then raise exception 'CAPACITY_EXCEEDED'; end if;
 if weight>vehicle.capacity_tons then raise exception 'CAPACITY_EXCEEDED'; end if;
 if exists(select 1 from public.bookings b where b.id<>result and b.status in ('confirmed','in_transit') and (b.vehicle_id=vehicle.id or b.driver_id=driver.id) and coalesce(b.departure_date,b.booking_date)<=ends and coalesce(b.arrival_date,b.departure_date,b.booking_date)>=starts) then raise exception 'RESOURCE_CONFLICT'; end if;
 trader:=nullif(p_data->>'trader_id','')::uuid;
 if trader is not null then
  if not exists(select 1 from public.traders t where t.id=trader and t.archived_at is null and (t.branch_id is null or t.branch_id is not distinct from bid)) then raise exception 'ACCESS_DENIED'; end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('trader:'||lower(trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),''))))||regexp_replace(p_data->>'trader_phone','[^0-9]','','g'),7));
  select id into trader from public.traders t where (t.branch_id is null or t.branch_id is not distinct from bid) and t.archived_at is null and lower(trim(t.full_name))=lower(trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),'')))) and regexp_replace(t.phone,'[^0-9]','','g')=regexp_replace(p_data->>'trader_phone','[^0-9]','','g') order by created_at limit 1;
  if trader is null then
   if exists(select 1 from public.traders t where lower(trim(t.full_name))=lower(trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),'')))) and regexp_replace(t.phone,'[^0-9]','','g')=regexp_replace(p_data->>'trader_phone','[^0-9]','','g')) then raise exception 'DUPLICATE_RECORD'; end if;
   insert into public.traders(full_name,first_name,last_name,phone,address,branch_id) values(trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),''))),trim(p_data->>'trader_first_name'),trim(p_data->>'trader_last_name'),trim(p_data->>'trader_phone'),trim(p_data->>'trader_address'),bid) returning id into trader;
  end if;
 end if;
 insert into public.bookings(id,trader_id,vehicle_id,driver_id,branch_id,booking_date,departure_date,arrival_date,service_type,trader_first_name,trader_last_name,trader_phone,trader_address,sender_is_trader,sender_name,sender_phone,sender_address,receiver_name,receiver_phone,receiver_address,goods,weight_tons,volume_m3,quantity,quantity_unit,quantity_amount,receiver_is_trader,origin,destination,created_by)
 values(result,trader,vehicle.id,driver.id,bid,day,starts,ends,p_data->>'service_type',trim(p_data->>'trader_first_name'),trim(p_data->>'trader_last_name'),trim(p_data->>'trader_phone'),trim(p_data->>'trader_address'),coalesce((p_data->>'sender_is_trader')::boolean,false),case when (p_data->>'sender_is_trader')::boolean then trim(concat_ws(' ',trim(p_data->>'trader_first_name'),nullif(trim(p_data->>'trader_last_name'),''))) else trim(p_data->>'sender_name') end,case when (p_data->>'sender_is_trader')::boolean then trim(p_data->>'trader_phone') else trim(p_data->>'sender_phone') end,case when (p_data->>'sender_is_trader')::boolean then trim(p_data->>'trader_address') else trim(p_data->>'sender_address') end,trim(p_data->>'receiver_name'),trim(p_data->>'receiver_phone'),trim(p_data->>'receiver_address'),trim(p_data->>'goods'),weight,volume,concat(p_data->>'quantity_amount',' ',p_data->>'quantity_unit'),p_data->>'quantity_unit',nullif(p_data->>'quantity_amount','')::numeric,coalesce((p_data->>'receiver_is_trader')::boolean,false),trim(p_data->>'origin'),trim(p_data->>'destination'),auth.uid())
 on conflict(id) do update set trader_id=excluded.trader_id,vehicle_id=excluded.vehicle_id,driver_id=excluded.driver_id,booking_date=excluded.booking_date,departure_date=excluded.departure_date,arrival_date=excluded.arrival_date,service_type=excluded.service_type,trader_first_name=excluded.trader_first_name,trader_last_name=excluded.trader_last_name,trader_phone=excluded.trader_phone,trader_address=excluded.trader_address,sender_is_trader=excluded.sender_is_trader,sender_name=excluded.sender_name,sender_phone=excluded.sender_phone,sender_address=excluded.sender_address,receiver_name=excluded.receiver_name,receiver_phone=excluded.receiver_phone,receiver_address=excluded.receiver_address,goods=excluded.goods,weight_tons=excluded.weight_tons,volume_m3=excluded.volume_m3,quantity=excluded.quantity,quantity_unit=excluded.quantity_unit,quantity_amount=excluded.quantity_amount,receiver_is_trader=excluded.receiver_is_trader,origin=excluded.origin,destination=excluded.destination;
 perform pedram_private.remember(p_request,'booking',payload,result); return result;
end; $$;
create or replace function public.cashbook_simple_post(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid := auth.uid(); bid uuid := nullif(p_data->>'branch_id','')::uuid;
 curr text := p_data->>'currency'; flow text := p_data->>'direction';
 amount numeric := nullif(p_data->>'amount','')::numeric; day date := (p_data->>'date')::date;
 trader uuid := nullif(p_data->>'trader_id','')::uuid; booking uuid := nullif(p_data->>'booking_id','')::uuid;
 label text := trim(p_data->>'description'); account uuid; prior public.cashbook_operations;
begin
 if actor is null or not public.cashbook_access(bid) then raise exception 'ACCESS_DENIED'; end if;
 if p_request is null then raise exception 'INVALID_ENTRY'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.cashbook_operations where id=p_request;
 if found then
  if prior.created_by<>actor then raise exception 'ACCESS_DENIED'; end if;
  if prior.request_payload is not null and prior.request_payload<>p_data then raise exception 'REQUEST_CONFLICT'; end if;
  return prior.id;
 end if;
 if curr is null or curr not in ('AFN','USD','PKR','IRR') or flow is null or flow not in ('in','out') then raise exception 'INVALID_ENTRY'; end if;
 if amount is null or amount<=0 or amount<>round(amount,2) or amount>999999999999.99 then raise exception 'INVALID_AMOUNT'; end if;
 if day is null or day>(now() at time zone 'Asia/Kabul')::date then raise exception 'INVALID_DATE'; end if;
 if coalesce(label,'')='' then raise exception 'DESCRIPTION_REQUIRED'; end if;
 if trader is not null and not exists(select 1 from public.traders t where t.id=trader and t.archived_at is null and public.operations_access(t.branch_id) and (t.branch_id is null or t.branch_id is not distinct from bid)) then raise exception 'ACCESS_DENIED'; end if;
 if booking is not null and (trader is null or not exists(select 1 from public.bookings b where b.id=booking and b.trader_id=trader and b.branch_id is not distinct from bid and b.archived_at is null)) then raise exception 'ACCESS_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(bid::text,'admin')||':'||curr,1));
 select id into account from public.cashbook_accounts where branch_id is not distinct from bid and channel='ledger' and currency=curr;
 if not found then
  insert into public.cashbook_accounts(branch_id,channel,currency,opening_date,opening_balance,created_by)
  values(bid,'ledger',curr,'0001-01-01',0,actor) returning id into account;
 end if;
 insert into public.cashbook_operations(id,mode,created_by,request_payload) values(p_request,case flow when 'in' then 'income' else 'expense' end,actor,p_data);
 insert into public.cashbook_entries(operation_id,account_id,entry_date,direction,amount,party,description,trader_id,booking_id)
 values(p_request,account,day,flow,amount,label,label,trader,booking);
 return p_request;
end; $$;
create or replace function public.trader_account_statement(p_trader uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED';end if;
 return jsonb_build_object(
 'charges',coalesce((select jsonb_agg(to_jsonb(c) order by c.charge_date,c.created_at) from public.trader_charges c where trader_id=p_trader),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'date',e.entry_date,'direction',e.direction,'amount',e.amount,'currency',a.currency,'description',e.description,'booking_id',e.booking_id,'booking_number',bk.booking_number,'branch',coalesce(b.name,'Admin')) order by e.entry_date,o.receipt_number) from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id join public.cashbook_operations o on o.id=e.operation_id left join public.branches b on b.id=a.branch_id left join public.bookings bk on bk.id=e.booking_id where e.trader_id=p_trader and not e.is_transfer),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'number',b.booking_number,'date',b.booking_date,'branch_id',b.branch_id,'origin',b.origin,'destination',b.destination)) from public.bookings b where b.trader_id=p_trader ),'[]'::jsonb));
end; $$;
commit;
