begin;
-- Head-office directory profiles can be selected by branches, but remain read-only.
create function public.registry_read_access(p_branch uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.operations_access(p_branch) or (p_branch is null and exists(select 1 from public.profiles p join public.branches b on b.id=p.branch_id where p.id=auth.uid() and p.account_enabled and p.role='branch_manager' and b.archived_at is null));
$$;
revoke all on function public.registry_read_access(uuid) from public,anon;
grant execute on function public.registry_read_access(uuid) to authenticated;
alter policy owners_read on public.vehicle_owners using(public.registry_read_access(branch_id));
alter policy owners_scope_guard on public.vehicle_owners using(public.registry_read_access(branch_id));
alter policy vehicles_read on public.vehicles using(public.registry_read_access(branch_id) or exists(select 1 from public.bookings b where b.vehicle_id=vehicles.id and public.driver_booking_access(b.driver_id)));
alter policy vehicles_scope_guard on public.vehicles using(public.registry_read_access(branch_id) or exists(select 1 from public.bookings b where b.vehicle_id=vehicles.id and public.driver_booking_access(b.driver_id)));
alter policy drivers_read on public.drivers using(public.registry_read_access(branch_id) or public.driver_booking_access(id));
alter policy drivers_scope_guard on public.drivers using(public.registry_read_access(branch_id) or public.driver_booking_access(id));
alter policy traders_read on public.traders using(public.registry_read_access(branch_id));
alter policy traders_scope_guard on public.traders using(public.registry_read_access(branch_id));

alter table public.trader_charges add column branch_id uuid references public.branches(id);
update public.trader_charges c set branch_id=b.branch_id from public.bookings b where b.id=c.booking_id;
update public.trader_charges c set branch_id=t.branch_id from public.traders t where t.id=c.trader_id and c.booking_id is null;
create index trader_charges_branch_idx on public.trader_charges(branch_id);
create policy "Branch reads own trader charges" on public.trader_charges for select to authenticated using(branch_id is not null and public.cashbook_access(branch_id));

create or replace function public.save_trader_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; actor public.profiles; result uuid:=coalesce(p_id,gen_random_uuid()); prior uuid; old public.traders;
 v_first text:=trim(p_data->>'first_name'); v_last text:=trim(p_data->>'last_name');
 v_phone text:=trim(p_data->>'phone'); v_name text; fingerprint jsonb:=jsonb_build_object('id',p_id,'data',p_data);
begin
 select * into actor from public.profiles where id=auth.uid() and account_enabled;
 if not found or actor.role not in ('president','vice_president','branch_manager') then raise exception 'ACCESS_DENIED';end if;
 bid:=case when actor.role='branch_manager' then actor.branch_id else nullif(p_data->>'branch_id','')::uuid end;
 if not public.operations_access(bid) then raise exception 'ACCESS_DENIED';end if;
 prior:=pedram_private.request_result(p_request,'trader',fingerprint); if prior is not null then return prior; end if;
 if coalesce(v_first,'')='' or coalesce(v_phone,'')='' then raise exception 'REQUIRED_FIELDS'; end if;
 v_name:=trim(concat_ws(' ',v_first,nullif(v_last,'')));
 perform pg_advisory_xact_lock(hashtextextended('trader:'||lower(v_name)||regexp_replace(v_phone,'[^0-9]','','g'),7));
 if exists(select 1 from public.traders t where t.id<>result and (t.branch_id is null or t.branch_id is not distinct from bid) and lower(trim(t.full_name))=lower(v_name) and regexp_replace(t.phone,'[^0-9]','','g')=regexp_replace(v_phone,'[^0-9]','','g')) then raise exception 'DUPLICATE_RECORD'; end if;
 if p_id is not null then
  select * into old from public.traders where id=p_id for update;
  if not found or not public.operations_access(old.branch_id) or old.branch_id is distinct from bid then raise exception 'ACCESS_DENIED';end if;
  if p_expected is null or old.updated_at<>p_expected then raise exception 'STALE_RECORD'; end if;
 end if;
 if coalesce((p_data->>'archived')::boolean,false) and exists(select 1 from public.bookings where trader_id=result and status in ('confirmed','in_transit') and archived_at is null) then raise exception 'RECORD_IN_USE'; end if;
 insert into public.traders(id,full_name,first_name,last_name,phone,address,archived_at,branch_id)
 values(result,v_name,v_first,v_last,v_phone,trim(p_data->>'address'),case when coalesce((p_data->>'archived')::boolean,false) then now() else null end,bid)
 on conflict(id) do update set full_name=excluded.full_name,first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,address=excluded.address,archived_at=excluded.archived_at;
 perform pedram_private.remember(p_request,'trader',fingerprint,result); return result;
end; $$;
create or replace function public.save_fleet_record(p_kind text,p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; prior uuid; record_id uuid:=coalesce(p_id,gen_random_uuid()); stamp timestamptz;
 owner uuid; linked uuid; existing_driver uuid; archived timestamptz; payload jsonb:=jsonb_build_object('id',p_id,'data',p_data); actor public.profiles;
begin
 select * into actor from public.profiles where id=auth.uid() and account_enabled;
 if not found or actor.role not in ('president','vice_president','branch_manager') then raise exception 'ACCESS_DENIED'; end if;
 if p_kind is null or p_kind not in ('vehicle','owner','driver') then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'fleet:'||p_kind,payload); if prior is not null then return prior; end if;
 bid:=nullif(p_data->>'branch_id','')::uuid;
 if actor.role='branch_manager' then bid:=actor.branch_id; end if;
 if not public.operations_access(bid) or (bid is not null and not exists(select 1 from public.branches where id=bid and archived_at is null)) then raise exception 'ACCESS_DENIED'; end if;
 if p_id is not null then
  if p_kind='vehicle' then select updated_at,branch_id into stamp,bid from public.vehicles where id=p_id for update;
  elsif p_kind='owner' then select updated_at,branch_id into stamp,bid from public.vehicle_owners where id=p_id for update;
  else select updated_at,branch_id into stamp,bid from public.drivers where id=p_id for update; end if;
  if not found or not public.operations_access(bid) then raise exception 'ACCESS_DENIED'; end if;
  if p_expected is null or stamp<>p_expected then raise exception 'STALE_RECORD'; end if;
  if nullif(p_data->>'branch_id','')::uuid is distinct from bid then raise exception 'ACCESS_DENIED'; end if;
 end if;
 archived:=case when coalesce((p_data->>'archived')::boolean,false) then now() else null end;
 if p_kind in ('owner','driver') then
  perform pg_advisory_xact_lock(hashtextextended(p_kind||coalesce(bid::text,'central')||lower(trim(p_data->>'full_name'))||regexp_replace(p_data->>'phone','\s','','g'),4));
  if p_id is null and ((p_kind='owner' and exists(select 1 from public.vehicle_owners where branch_id is not distinct from bid and lower(trim(full_name))=lower(trim(p_data->>'full_name')) and regexp_replace(phone,'\s','','g')=regexp_replace(p_data->>'phone','\s','','g'))) or (p_kind='driver' and exists(select 1 from public.drivers where branch_id is not distinct from bid and lower(trim(full_name))=lower(trim(p_data->>'full_name')) and regexp_replace(phone,'\s','','g')=regexp_replace(p_data->>'phone','\s','','g')))) then raise exception 'DUPLICATE_RECORD'; end if;
 end if;
 if archived is not null or p_data->>'status' in ('inactive','under_repair','assigned','on_trip') then
  if exists(select 1 from public.bookings where status in ('confirmed','in_transit') and ((p_kind='vehicle' and vehicle_id=record_id) or (p_kind='driver' and driver_id=record_id))) then raise exception 'RECORD_IN_USE'; end if;
 end if;
 if p_kind='owner' then
  if coalesce(trim(p_data->>'full_name'),'')='' or coalesce(trim(p_data->>'phone'),'')='' then raise exception 'REQUIRED_FIELDS'; end if;
  if archived is not null and (exists(select 1 from public.vehicles where owner_id=record_id and archived_at is null) or exists(select 1 from public.drivers where owner_id=record_id and archived_at is null)) then raise exception 'RECORD_IN_USE'; end if;
  insert into public.vehicle_owners(id,full_name,father_name,phone,national_id,address,notes,province,branch_id,archived_at,created_by)
  values(record_id,trim(p_data->>'full_name'),trim(p_data->>'father_name'),trim(p_data->>'phone'),nullif(trim(p_data->>'national_id'),''),trim(p_data->>'address'),trim(p_data->>'notes'),trim(p_data->>'province'),bid,archived,auth.uid())
  on conflict(id) do update set full_name=excluded.full_name,father_name=excluded.father_name,phone=excluded.phone,national_id=excluded.national_id,address=excluded.address,notes=excluded.notes,province=excluded.province,archived_at=excluded.archived_at;
  if p_id is null and coalesce((p_data->>'owner_is_driver')::boolean,false) then
   perform pg_advisory_xact_lock(hashtextextended('driver'||coalesce(bid::text,'central')||lower(trim(p_data->>'full_name'))||regexp_replace(p_data->>'phone','\s','','g'),4));
   select id into existing_driver from public.drivers where branch_id is not distinct from bid and lower(trim(full_name))=lower(trim(p_data->>'full_name')) and regexp_replace(phone,'\s','','g')=regexp_replace(p_data->>'phone','\s','','g') order by created_at limit 1 for update;
   if existing_driver is not null then
    if exists(select 1 from public.drivers where id=existing_driver and (owner_id is not null or archived_at is not null)) then raise exception 'DUPLICATE_RECORD'; end if;
    update public.drivers set owner_id=record_id where id=existing_driver;
   else
    insert into public.drivers(owner_id,full_name,father_name,phone,national_id,address,license_number,license_expiry,branch_id,created_by)
    values(record_id,trim(p_data->>'full_name'),trim(p_data->>'father_name'),trim(p_data->>'phone'),nullif(trim(p_data->>'national_id'),''),trim(p_data->>'address'),trim(p_data->>'license_number'),nullif(p_data->>'license_expiry','')::date,bid,auth.uid());
   end if;
  end if;
 elsif p_kind='vehicle' then
  owner:=nullif(p_data->>'owner_id','')::uuid;
  perform 1 from public.vehicle_owners where id=owner for update;
  if not exists(select 1 from public.vehicle_owners where id=owner and archived_at is null and (branch_id is null or branch_id is not distinct from bid)) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  if coalesce(trim(p_data->>'plate_number'),'')='' or coalesce(trim(p_data->>'vehicle_type'),'')='' then raise exception 'REQUIRED_FIELDS'; end if;
  if nullif(p_data->>'capacity_tons','')::numeric<=0 or p_data->>'capacity_tons' in ('NaN','Infinity','-Infinity') or nullif(p_data->>'volume_capacity_m3','')::numeric<=0 or p_data->>'volume_capacity_m3' in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_CAPACITY'; end if;
  if exists(select 1 from public.bookings where vehicle_id=record_id and status in ('confirmed','in_transit') and (volume_m3>coalesce(nullif(p_data->>'volume_capacity_m3','')::numeric,0) or weight_tons>coalesce(nullif(p_data->>'capacity_tons','')::numeric,0) or nullif(p_data->>'permit_expiry','')::date<coalesce(arrival_date,departure_date,booking_date))) then raise exception 'RECORD_IN_USE'; end if;
  insert into public.vehicles(id,owner_id,plate_number,foreign_plate_number,vin_number,vehicle_type,capacity_tons,volume_capacity_m3,model_year,color,status,permit_number,permit_expiry,notes,branch_id,archived_at,created_by)
  values(record_id,owner,upper(regexp_replace(trim(p_data->>'plate_number'),'\s','','g')),upper(trim(p_data->>'foreign_plate_number')),trim(p_data->>'vin_number'),trim(p_data->>'vehicle_type'),nullif(p_data->>'capacity_tons','')::numeric,nullif(p_data->>'volume_capacity_m3','')::numeric,nullif(p_data->>'model_year','')::integer,trim(p_data->>'color'),coalesce(nullif(p_data->>'status',''),'available')::public.vehicle_status,trim(p_data->>'permit_number'),nullif(p_data->>'permit_expiry','')::date,trim(p_data->>'notes'),bid,archived,auth.uid())
  on conflict(id) do update set owner_id=excluded.owner_id,plate_number=excluded.plate_number,foreign_plate_number=excluded.foreign_plate_number,vin_number=excluded.vin_number,vehicle_type=excluded.vehicle_type,capacity_tons=excluded.capacity_tons,volume_capacity_m3=excluded.volume_capacity_m3,model_year=excluded.model_year,color=excluded.color,status=excluded.status,permit_number=excluded.permit_number,permit_expiry=excluded.permit_expiry,notes=excluded.notes,archived_at=excluded.archived_at;
 else
  if coalesce(trim(p_data->>'full_name'),'')='' or coalesce(trim(p_data->>'phone'),'')='' then raise exception 'REQUIRED_FIELDS'; end if;
  linked:=nullif(p_data->>'user_id','')::uuid;
  if p_id is not null and not public.is_president_user() then
   if linked is distinct from (select user_id from public.drivers where id=p_id) then raise exception 'ACCESS_DENIED'; end if;
  elsif linked is not null and (not public.is_president_user() or not exists(select 1 from public.profiles where id=linked and role='driver' and account_enabled and branch_id is not distinct from bid)) then raise exception 'ACCESS_DENIED'; end if;
  if exists(select 1 from public.bookings where driver_id=record_id and status in ('confirmed','in_transit') and nullif(p_data->>'license_expiry','')::date<coalesce(arrival_date,departure_date,booking_date)) then raise exception 'RECORD_IN_USE'; end if;
  insert into public.drivers(id,full_name,father_name,phone,national_id,license_number,license_expiry,address,status,branch_id,user_id,archived_at,created_by)
  values(record_id,trim(p_data->>'full_name'),trim(p_data->>'father_name'),trim(p_data->>'phone'),nullif(trim(p_data->>'national_id'),''),trim(p_data->>'license_number'),nullif(p_data->>'license_expiry','')::date,trim(p_data->>'address'),coalesce(nullif(p_data->>'status',''),'available')::public.driver_status,bid,linked,archived,auth.uid())
  on conflict(id) do update set full_name=excluded.full_name,father_name=excluded.father_name,phone=excluded.phone,national_id=excluded.national_id,license_number=excluded.license_number,license_expiry=excluded.license_expiry,address=excluded.address,status=excluded.status,user_id=excluded.user_id,archived_at=excluded.archived_at;
 end if;
 if p_kind='driver' then update public.profiles set full_name=trim(p_data->>'full_name'),phone=trim(p_data->>'phone') where id=(select user_id from public.drivers where id=record_id); end if;
 if p_kind='driver' and (archived is not null or p_data->>'status'='inactive') then update public.profiles set account_enabled=false where id=(select user_id from public.drivers where id=record_id); end if;
 perform pedram_private.remember(p_request,'fleet:'||p_kind,payload,record_id); return record_id;
end; $$;
create or replace function public.cashbook_simple_post(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid := auth.uid(); bid uuid := nullif(p_data->>'branch_id','')::uuid;
 curr text := p_data->>'currency'; flow text := p_data->>'direction';
 amount numeric := nullif(p_data->>'amount','')::numeric; day date := (p_data->>'date')::date;
 trader uuid := nullif(p_data->>'trader_id','')::uuid;
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
 if trader is not null and not exists(select 1 from public.traders t where t.id=trader and t.archived_at is null and public.registry_read_access(t.branch_id) and (t.branch_id is null or t.branch_id is not distinct from bid)) then raise exception 'ACCESS_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(bid::text,'admin')||':'||curr,1));
 select id into account from public.cashbook_accounts where branch_id is not distinct from bid and channel='ledger' and currency=curr;
 if not found then
  insert into public.cashbook_accounts(branch_id,channel,currency,opening_date,opening_balance,created_by)
  values(bid,'ledger',curr,'0001-01-01',0,actor) returning id into account;
 end if;
 insert into public.cashbook_operations(id,mode,created_by,request_payload) values(p_request,case flow when 'in' then 'income' else 'expense' end,actor,p_data);
 insert into public.cashbook_entries(operation_id,account_id,entry_date,direction,amount,party,description,trader_id)
 values(p_request,account,day,flow,amount,label,label,trader);
 return p_request;
end; $$;

create or replace function public.add_trader_charge(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare trader uuid:=(p_data->>'trader_id')::uuid; booking uuid:=nullif(p_data->>'booking_id','')::uuid;
 bid uuid; actor public.profiles; amount numeric:=(p_data->>'amount')::numeric;
 result uuid:=gen_random_uuid(); prior uuid;
begin
 select * into actor from public.profiles where id=auth.uid() and account_enabled;
 if not found or actor.role not in ('president','branch_manager') then raise exception 'ACCESS_DENIED';end if;
 bid:=case when actor.role='branch_manager' then actor.branch_id else nullif(p_data->>'branch_id','')::uuid end;
 if not public.cashbook_access(bid) then raise exception 'ACCESS_DENIED';end if;
 prior:=pedram_private.request_result(p_request,'trader-charge',p_data);if prior is not null then return prior;end if;
 perform 1 from public.traders t where t.id=trader and t.archived_at is null and public.registry_read_access(t.branch_id) and (t.branch_id is null or t.branch_id is not distinct from bid) for update;
 if not found then raise exception 'RESOURCE_UNAVAILABLE';end if;
 if amount is null or amount<=0 or amount<>round(amount,2) or amount>999999999999.99 or amount::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_AMOUNT';end if;
 if nullif(trim(p_data->>'description'),'') is null or p_data->>'currency' is null or p_data->>'currency' not in ('AFN','USD','PKR','IRR') or nullif(p_data->>'date','')::date is null then raise exception 'REQUIRED_FIELDS';end if;
 if booking is not null and not exists(select 1 from public.bookings b where b.id=booking and b.trader_id=trader and b.branch_id is not distinct from bid and b.archived_at is null and b.status<>'cancelled') then raise exception 'RESOURCE_UNAVAILABLE';end if;
 insert into public.trader_charges(id,trader_id,booking_id,charge_date,description,currency,amount,branch_id)
 values(result,trader,booking,(p_data->>'date')::date,trim(p_data->>'description'),p_data->>'currency',amount,bid);
 perform pedram_private.remember(p_request,'trader-charge',p_data,result);return result;
end; $$;
create or replace function public.void_trader_charge(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.trader_charges;
begin
 select * into c from public.trader_charges where id=p_id for update;
 if not found or not public.cashbook_access(c.branch_id) then raise exception 'ACCESS_DENIED';end if;
 update public.trader_charges set voided_at=coalesce(voided_at,now()) where id=p_id;
end; $$;
create or replace function public.trader_account_statement(p_trader uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p join public.traders t on t.id=p_trader where p.id=auth.uid() and p.account_enabled and p.role in ('president','branch_manager') and public.registry_read_access(t.branch_id)) then raise exception 'ACCESS_DENIED';end if;
 return jsonb_build_object(
 'charges',coalesce((select jsonb_agg(to_jsonb(c) order by c.charge_date,c.created_at) from public.trader_charges c where c.trader_id=p_trader and public.cashbook_access(c.branch_id)),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'date',e.entry_date,'direction',e.direction,'amount',e.amount,'currency',a.currency,'description',e.description,'branch',coalesce(b.name,'Admin')) order by e.entry_date,o.receipt_number) from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id join public.cashbook_operations o on o.id=e.operation_id left join public.branches b on b.id=a.branch_id where e.trader_id=p_trader and not e.is_transfer and public.cashbook_access(a.branch_id)),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'number',b.booking_number,'origin',b.origin,'destination',b.destination,'branch_id',b.branch_id)) from public.bookings b where b.trader_id=p_trader and public.operations_access(b.branch_id) and b.archived_at is null and b.status<>'cancelled'),'[]'::jsonb));
end; $$;
commit;

