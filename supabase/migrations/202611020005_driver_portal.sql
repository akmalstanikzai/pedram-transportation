begin;

-- Driver reports belong to the assigned booking, not a permanent vehicle pairing.
-- Safe to rerun after an earlier or partially applied Dashboard installation.
alter table public.bookings
 add column if not exists driver_accepted_at timestamptz,
 add column if not exists driver_delivered_at timestamptz;
grant select(driver_accepted_at,driver_delivered_at) on public.bookings to authenticated;
create index if not exists bookings_driver_portal_idx on public.bookings(driver_id,departure_date desc,id) where archived_at is null;

create or replace function public.driver_booking_access(p_driver uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.drivers d join public.profiles p on p.id=d.user_id
  where d.id=p_driver and p.id=auth.uid() and p.role='driver' and p.account_enabled
  and d.archived_at is null and d.status<>'inactive');
$$;

-- An edited assignment needs fresh acceptance, including contact/address changes.
create or replace function pedram_private.reset_driver_booking_reports() returns trigger
language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-array['updated_at','status','archived_at','driver_accepted_at','driver_delivered_at'])
    is distinct from (to_jsonb(old)-array['updated_at','status','archived_at','driver_accepted_at','driver_delivered_at']) then
  new.driver_accepted_at:=null;
  new.driver_delivered_at:=null;
 end if;
 return new;
end; $$;
drop trigger if exists bookings_reset_driver_reports on public.bookings;
create trigger bookings_reset_driver_reports before update on public.bookings
 for each row execute function pedram_private.reset_driver_booking_reports();

-- Only the minimum operational fields; never expose trader accounts or ID scans.
create or replace function public.get_driver_portal() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.drivers; jobs jsonb;
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='driver' and p.account_enabled) then
  raise exception 'ACCESS_DENIED';
 end if;
 select * into d from public.drivers where user_id=auth.uid() and public.driver_booking_access(id);
 if not found then return jsonb_build_object('driver',null,'bookings','[]'::jsonb); end if;
 select coalesce(jsonb_agg(job order by priority,departure_date,id),'[]'::jsonb) into jobs from (
  select b.id,b.departure_date,case when b.status='in_transit' then 0 when b.status='confirmed' then 1 else 2 end priority,
   jsonb_build_object(
    'id',b.id,'booking_number',b.booking_number,'status',b.status,'updated_at',b.updated_at,
    'departure_date',b.departure_date,'arrival_date',b.arrival_date,
    'origin',b.origin,'destination',b.destination,'goods',b.goods,'quantity',b.quantity,
    'weight_tons',b.weight_tons,'volume_m3',b.volume_m3,
    'sender_name',b.sender_name,'sender_phone',b.sender_phone,'sender_address',b.sender_address,
    'receiver_name',b.receiver_name,'receiver_phone',b.receiver_phone,'receiver_address',b.receiver_address,
    'driver_accepted_at',b.driver_accepted_at,'driver_delivered_at',b.driver_delivered_at,
    'vehicle',case when v.id is null then null else jsonb_build_object('plate_number',v.plate_number,
      'foreign_plate_number',v.foreign_plate_number,'vehicle_type',v.vehicle_type,'color',v.color) end,
    'branch',jsonb_build_object('name',coalesce(br.name,'Head office'),
      'phone',coalesce(nullif(br.phone,''),nullif(manager.phone,'')))
   ) job
  from public.bookings b
  left join public.vehicles v on v.id=b.vehicle_id
  left join public.branches br on br.id=b.branch_id
  left join public.profiles manager on manager.id=br.manager_user_id
  where b.driver_id=d.id and b.archived_at is null
   and (b.status in ('confirmed','in_transit') or b.id in (
    select h.id from public.bookings h where h.driver_id=d.id and h.archived_at is null
      and h.status in ('completed','cancelled') order by h.departure_date desc,h.id limit 20
   ))
 ) assigned;
 return jsonb_build_object('driver',jsonb_build_object('full_name',d.full_name,'phone',d.phone,
  'license_number',d.license_number,'license_expiry',d.license_expiry),'bookings',jobs);
end; $$;

-- Retrying the same action is harmless. Stale assignments require a fresh read.
-- Delivered is a report only; management retains completion/cancellation controls.
create or replace function public.driver_booking_action(p_id uuid,p_action text,p_expected timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
 select * into b from public.bookings where id=p_id for update;
 if not found or not public.driver_booking_access(b.driver_id) then raise exception 'ACCESS_DENIED'; end if;
 if b.archived_at is not null then raise exception 'RECORD_LOCKED'; end if;
 if p_action='accept' and b.status='confirmed' then
  if b.driver_accepted_at is not null then return b.id; end if;
 elsif p_action='delivered' and b.status='in_transit' then
  if b.driver_delivered_at is not null then return b.id; end if;
 else raise exception 'INVALID_TRANSITION';
 end if;
 if p_expected is null or b.updated_at<>p_expected then raise exception 'STALE_RECORD'; end if;
 update public.bookings set
  driver_accepted_at=case when p_action='accept' then now() else driver_accepted_at end,
  driver_delivered_at=case when p_action='delivered' then now() else driver_delivered_at end
 where id=b.id;
 return b.id;
end; $$;

revoke all on function public.get_driver_portal(),public.driver_booking_action(uuid,text,timestamptz) from public,anon;
grant execute on function public.get_driver_portal(),public.driver_booking_action(uuid,text,timestamptz) to authenticated;
revoke all on function pedram_private.reset_driver_booking_reports() from public,anon,authenticated;
commit;
