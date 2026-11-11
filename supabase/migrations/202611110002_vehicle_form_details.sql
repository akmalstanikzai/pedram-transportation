begin;

-- Only the owner association becomes optional. Existing identifiers, model
-- years, permits, photos and documents remain stored unchanged.
alter table public.vehicles alter column owner_id drop not null;
alter table public.vehicles add column if not exists province text,
 add column if not exists model text;

-- Extend the installed save function so prior scope, retry, capacity and
-- document checks remain in force.
do $$
declare definition text;
 old_guard text := $old$if not exists(select 1 from public.vehicle_owners where id=owner and archived_at is null and (branch_id is null or branch_id is not distinct from bid))$old$;
 new_guard text := $new$if owner is not null and not exists(select 1 from public.vehicle_owners where id=owner and archived_at is null and (branch_id is null or branch_id is not distinct from bid))$new$;
begin
 definition := replace(pg_get_functiondef('public.save_fleet_record(text,uuid,uuid,jsonb,timestamptz)'::regprocedure),chr(13),'');
 if position(old_guard in definition)>0 then definition:=replace(definition,old_guard,new_guard);
 elsif position(new_guard in definition)=0 then raise exception 'Unexpected Fleet owner guard'; end if;
 if position('plate_number,foreign_plate_number,province,model,vin_number' in definition)=0 then
  if position('plate_number,foreign_plate_number,vin_number' in definition)=0 then raise exception 'Unexpected Fleet vehicle fields'; end if;
  definition:=replace(definition,'plate_number,foreign_plate_number,vin_number','plate_number,foreign_plate_number,province,model,vin_number');
  definition:=replace(definition,
   $old$upper(trim(p_data->>'foreign_plate_number')),trim(p_data->>'vin_number')$old$,
   $new$upper(trim(p_data->>'foreign_plate_number')),nullif(trim(p_data->>'province'),''),nullif(trim(p_data->>'model'),''),trim(p_data->>'vin_number')$new$);
  definition:=replace(definition,
   'foreign_plate_number=excluded.foreign_plate_number,vin_number=excluded.vin_number',
   'foreign_plate_number=excluded.foreign_plate_number,province=excluded.province,model=excluded.model,vin_number=excluded.vin_number');
 end if;
 execute definition;
end; $$;

-- A selected owner must still have the correct branch scope. An unlinked
-- vehicle has no owner's scope to check.
create or replace function pedram_private.check_vehicle_owner_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.owner_id is null then return new; end if;
 if tg_op='UPDATE' then
  if new.owner_id is not distinct from old.owner_id and new.branch_id is not distinct from old.branch_id then return new; end if;
 end if;
 perform 1 from public.vehicle_owners o where o.id=new.owner_id
  and (o.branch_id is null or o.branch_id=new.branch_id) for share;
 if not found then raise exception 'OWNER_SCOPE_MISMATCH'; end if;
 return new;
end; $$;

do $$
declare definition text; matched_guard text[];
 -- Match SQL tokens rather than a pasted block's indentation or line endings.
 -- Expanded regex mode ignores formatting within this pattern itself.
 guard_pattern text := $pattern$
 perform \s+ 1 \s+ from \s+ public[.]vehicle_owners \s+ o \s+
 where \s+ o[.]id \s* = \s* owner_id \s+ and \s+
 o[.]archived_at \s+ is \s+ null \s+ and \s*
 [(] \s* o[.]branch_id \s+ is \s+ null \s+ or \s+
 o[.]branch_id \s* = \s* p_branch \s* [)] \s+ for \s+ share \s* ;
 \s* if \s+ not \s+ found \s+ then \s+ raise \s+ exception \s+
 'OWNER_SCOPE_MISMATCH' \s* ; \s* end \s+ if \s* ;
 $pattern$;
begin
 definition:=replace(pg_get_functiondef('public.set_fleet_branch_scope(text,uuid,uuid,timestamptz)'::regprocedure),chr(13),'');
 if definition !~* 'if[[:space:]]+owner_id[[:space:]]+is[[:space:]]+not[[:space:]]+null[[:space:]]+then' then
  matched_guard:=regexp_match(definition,guard_pattern,'ix');
  if matched_guard is null then raise exception 'Unexpected Fleet scope owner guard'; end if;
  definition:=replace(definition,matched_guard[1],'if owner_id is not null then'||chr(10)||matched_guard[1]||chr(10)||'  end if;');
  execute definition;
 end if;
end; $$;

-- Newly registered vehicles without owners must also be bookable. Retain
-- the active-owner requirement whenever an owner is actually linked.
do $$
declare definition text;
 old_guard text := 'or not exists(select 1 from public.vehicle_owners where id=vehicle.owner_id and archived_at is null)';
 new_guard text := 'or (vehicle.owner_id is not null and not exists(select 1 from public.vehicle_owners where id=vehicle.owner_id and archived_at is null))';
begin
 definition:=pg_get_functiondef('public.save_booking_record(uuid,uuid,jsonb,timestamptz)'::regprocedure);
 if position(old_guard in definition)>0 then
  execute replace(definition,old_guard,new_guard);
 elsif position(new_guard in definition)=0 then raise exception 'Unexpected booking vehicle owner guard'; end if;
end; $$;

commit;
