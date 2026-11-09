begin;

create function public.set_fleet_branch_scope(p_kind text,p_id uuid,p_branch uuid,p_expected timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare
 current_branch uuid;
 stamp timestamptz;
 owner_id uuid;
 driver_user uuid;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if p_branch is not null then
  perform 1 from public.branches where id=p_branch and archived_at is null for share;
  if not found then raise exception 'BRANCH_UNAVAILABLE'; end if;
 end if;

 case p_kind
  when 'vehicle' then
   select v.branch_id,v.updated_at,v.owner_id into current_branch,stamp,owner_id
   from public.vehicles v where v.id=p_id and v.archived_at is null for update;
  when 'driver' then
   select d.branch_id,d.updated_at,d.user_id into current_branch,stamp,driver_user
   from public.drivers d where d.id=p_id and d.archived_at is null for update;
  when 'owner' then
   select o.branch_id,o.updated_at into current_branch,stamp
   from public.vehicle_owners o where o.id=p_id and o.archived_at is null for update;
  else raise exception 'RESOURCE_UNAVAILABLE';
 end case;
 if stamp is null then raise exception 'RESOURCE_UNAVAILABLE'; end if;
 if current_branch is not distinct from p_branch then return; end if;
 if stamp is distinct from p_expected then raise exception 'STALE_RECORD'; end if;

 if p_kind='vehicle' then
  perform 1 from public.vehicle_owners o where o.id=owner_id and o.archived_at is null
   and (o.branch_id is null or o.branch_id=p_branch) for share;
  if not found then raise exception 'OWNER_SCOPE_MISMATCH'; end if;
  if p_branch is not null and exists(
   select 1 from public.bookings b where b.vehicle_id=p_id and b.status in ('confirmed','in_transit')
   and b.archived_at is null and b.deleted_at is null and b.branch_id is distinct from p_branch
  ) then raise exception 'RECORD_IN_USE'; end if;
  update public.vehicles set branch_id=p_branch where id=p_id;
 elsif p_kind='driver' then
  if p_branch is not null and exists(
   select 1 from public.bookings b where b.driver_id=p_id and b.status in ('confirmed','in_transit')
   and b.archived_at is null and b.deleted_at is null and b.branch_id is distinct from p_branch
  ) then raise exception 'RECORD_IN_USE'; end if;
  if driver_user is not null then
   update public.profiles set branch_id=p_branch where id=driver_user and role='driver';
   if not found then raise exception 'ACCOUNT_LINK_INVALID'; end if;
  end if;
  update public.drivers set branch_id=p_branch where id=p_id;
 else
  if p_branch is not null and exists(
   select 1 from public.vehicles v where v.owner_id=p_id and v.branch_id is distinct from p_branch
  ) then raise exception 'OWNER_HAS_OTHER_FLEET'; end if;
  update public.vehicle_owners set branch_id=p_branch where id=p_id;
 end if;
end; $$;

revoke execute on function public.set_fleet_branch_scope(text,uuid,uuid,timestamptz) from public,anon;
grant execute on function public.set_fleet_branch_scope(text,uuid,uuid,timestamptz) to authenticated;

-- Serialize changes to a vehicle's owner/scope with changes to the owner's
-- scope. Ordinary edits and historical records keep their existing behavior.
create function pedram_private.check_vehicle_owner_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.owner_id is not distinct from old.owner_id and new.branch_id is not distinct from old.branch_id then return new; end if;
 end if;
 perform 1 from public.vehicle_owners o where o.id=new.owner_id
  and (o.branch_id is null or o.branch_id=new.branch_id) for share;
 if not found then raise exception 'OWNER_SCOPE_MISMATCH'; end if;
 return new;
end; $$;
revoke execute on function pedram_private.check_vehicle_owner_scope() from public,anon,authenticated;
create trigger vehicles_owner_scope before insert or update of owner_id,branch_id
 on public.vehicles for each row execute function pedram_private.check_vehicle_owner_scope();

commit;
