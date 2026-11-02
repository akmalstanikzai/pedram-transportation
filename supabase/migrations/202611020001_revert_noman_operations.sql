-- Restore the pre-202611010003/004 client contract without deleting business data.
-- Apply with the matching frontend and pre-hardening Edge Function release.
begin;

do $$ begin
  if to_regprocedure('public.save_fleet_record(text,uuid,uuid,jsonb,timestamptz)') is null
     or to_regprocedure('public.workspace_alerts(integer)') is null
     or not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'vehicles'
         and policyname = 'vehicles_scope_guard'
     ) then
    raise exception 'Expected 202611010003 and 202611010004 migrations are missing or partial';
  end if;
end $$;

-- Remove only policies introduced by the two reverted migrations. Earlier
-- management and branch policies remain in place.
drop policy if exists profiles_read on public.profiles;
drop policy if exists branches_read on public.branches;
drop policy if exists owners_read on public.vehicle_owners;
drop policy if exists vehicles_read on public.vehicles;
drop policy if exists drivers_read on public.drivers;
drop policy if exists traders_read on public.traders;
drop policy if exists bookings_read on public.bookings;
drop policy if exists profiles_scope_guard on public.profiles;
drop policy if exists branches_scope_guard on public.branches;
drop policy if exists owners_scope_guard on public.vehicle_owners;
drop policy if exists vehicles_scope_guard on public.vehicles;
drop policy if exists drivers_scope_guard on public.drivers;
drop policy if exists traders_scope_guard on public.traders;
drop policy if exists bookings_scope_guard on public.bookings;
drop policy if exists documents_read on public.vehicle_documents;
drop policy if exists documents_scope_guard on public.vehicle_documents;

drop policy if exists fleet_objects_read on storage.objects;
drop policy if exists fleet_objects_insert on storage.objects;
drop policy if exists fleet_objects_delete on storage.objects;
drop policy if exists fleet_objects_read_guard on storage.objects;
drop policy if exists fleet_objects_insert_guard on storage.objects;
drop policy if exists fleet_objects_delete_guard on storage.objects;
drop policy if exists fleet_objects_no_overwrite on storage.objects;
drop policy if exists fleet_objects_no_anonymous_access on storage.objects;

-- Restore the earlier policies for the private fleet-documents bucket.
create policy "Management can read fleet documents" on storage.objects
for select to authenticated
using (bucket_id = 'fleet-documents' and public.is_management_user());
create policy "Management can upload fleet documents" on storage.objects
for insert to authenticated
with check (bucket_id = 'fleet-documents' and public.is_management_user());
update storage.buckets set allowed_mime_types = null where id = 'fleet-documents';

create or replace function public.is_management_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('president', 'vice_president')
  );
$$;
create or replace function public.is_president_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'president'
  );
$$;

-- 202611010003 replaced this RPC. Restore its implementation from
-- 202610310004_booking_details.sql before removing the new write RPCs.
create or replace function public.create_booking_record(p_data jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare trader uuid; vehicle uuid; driver uuid; result uuid; first_name text; last_name text;
begin
 if not public.is_management_user() then raise exception 'Access denied'; end if;
 first_name := trim(p_data->>'trader_first_name'); last_name := trim(p_data->>'trader_last_name');
 if coalesce(first_name,'') = '' or coalesce(trim(p_data->>'trader_phone'),'') = '' or coalesce(trim(p_data->>'trader_address'),'') = '' then raise exception 'Trader name, contact and address are required'; end if;
 if coalesce(trim(p_data->>'sender_name'),'') = '' or coalesce(trim(p_data->>'sender_phone'),'') = '' or coalesce(trim(p_data->>'sender_address'),'') = '' or coalesce(trim(p_data->>'receiver_name'),'') = '' or coalesce(trim(p_data->>'receiver_phone'),'') = '' or coalesce(trim(p_data->>'receiver_address'),'') = '' then raise exception 'Sender and receiver details are required'; end if;
 if coalesce(trim(p_data->>'origin'),'') = '' or coalesce(trim(p_data->>'destination'),'') = '' or coalesce(trim(p_data->>'goods'),'') = '' then raise exception 'Goods and route are required'; end if;
 if nullif(p_data->>'weight_tons','') is null and nullif(p_data->>'volume_m3','') is null then raise exception 'Enter weight or volume'; end if;
 trader := nullif(p_data->>'trader_id','')::uuid;
 if trader is null then
  insert into public.traders(full_name,first_name,last_name,phone,address) values(concat_ws(' ',first_name,nullif(last_name,'')),first_name,last_name,trim(p_data->>'trader_phone'),p_data->>'trader_address') returning id into trader;
 end if;
 vehicle := nullif(p_data->>'vehicle_id','')::uuid; driver := nullif(p_data->>'driver_id','')::uuid;
 if vehicle is null or driver is null then raise exception 'Select a vehicle and driver'; end if;
 if exists(select 1 from public.drivers d where d.id=driver and d.vehicle_id is not null and d.vehicle_id <> vehicle) then raise exception 'Driver is assigned to another vehicle'; end if;
 insert into public.bookings(trader_id,vehicle_id,driver_id,booking_date,service_type,trader_first_name,trader_last_name,trader_phone,trader_address,sender_is_trader,sender_name,sender_phone,sender_address,receiver_name,receiver_phone,receiver_address,goods,weight_tons,volume_m3,origin,destination)
 values(trader,vehicle,driver,(p_data->>'booking_date')::date,p_data->>'service_type',first_name,last_name,p_data->>'trader_phone',p_data->>'trader_address',coalesce((p_data->>'sender_is_trader')::boolean,false),p_data->>'sender_name',p_data->>'sender_phone',p_data->>'sender_address',p_data->>'receiver_name',p_data->>'receiver_phone',p_data->>'receiver_address',p_data->>'goods',nullif(p_data->>'weight_tons','')::numeric,nullif(p_data->>'volume_m3','')::numeric,p_data->>'origin',p_data->>'destination') returning id into result;
 return result;
end; $$;

revoke all on public.profiles, public.branches, public.vehicle_owners,
  public.vehicles, public.drivers, public.traders, public.bookings,
  public.vehicle_documents from authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.branches,
  public.vehicle_owners, public.vehicles, public.drivers,
  public.vehicle_documents to authenticated;
grant select, insert, update on public.traders, public.bookings to authenticated;
grant usage, select on sequence public.bookings_booking_number_seq to authenticated;
revoke all on function public.create_booking_record(jsonb) from public, anon;
grant execute on function public.create_booking_record(jsonb) to authenticated;

drop function if exists public.update_my_profile(text,text);
drop function if exists public.search_workspace(text,text,integer);
drop function if exists public.workspace_alerts(integer);
drop function if exists public.save_fleet_record(text,uuid,uuid,jsonb,timestamptz);
drop function if exists public.save_booking_record(uuid,uuid,jsonb,timestamptz);
drop function if exists public.change_booking_status(uuid,text,uuid,timestamptz);
drop function if exists public.save_branch_record(uuid,uuid,jsonb,timestamptz,uuid);
drop function if exists public.provision_branch(uuid,uuid,uuid,jsonb,text,uuid,timestamptz);
drop function if exists public.find_branch_provisioning_account(uuid,uuid,text);
drop function if exists public.reserve_fleet_document(uuid,text,uuid,text,text,text,integer,date);
drop function if exists public.complete_fleet_document(uuid);
drop function if exists public.remove_fleet_document(uuid,boolean);
drop function if exists public.set_fleet_document_expiry(uuid,date);
drop function if exists public.document_path_access(text);
drop function if exists public.driver_booking_access(uuid);
drop function if exists public.operations_access(uuid);

-- Retain new columns, constraints, document rows, and idempotency history.
-- Dropping them could erase records created since the forward migrations.
commit;
