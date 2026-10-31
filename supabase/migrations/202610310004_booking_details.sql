begin;
alter table public.traders add column if not exists first_name text, add column if not exists last_name text, add column if not exists address text;
update public.traders set first_name = full_name where first_name is null;
alter table public.bookings
 add column if not exists booking_date date,
 add column if not exists trader_first_name text,
 add column if not exists trader_last_name text,
 add column if not exists trader_address text,
 add column if not exists trader_phone text,
 add column if not exists sender_is_trader boolean not null default false,
 add column if not exists sender_name text,
 add column if not exists sender_phone text,
 add column if not exists sender_address text,
 add column if not exists receiver_name text,
 add column if not exists receiver_phone text,
 add column if not exists receiver_address text,
 add column if not exists weight_tons numeric(12,3) check (weight_tons > 0),
 add column if not exists volume_m3 numeric(12,3) check (volume_m3 > 0);
update public.bookings set booking_date = (created_at at time zone 'Asia/Kabul')::date where booking_date is null;
alter table public.bookings alter column booking_date set not null;
-- Preserve historical financial values; new bookings do not require them.
alter table public.bookings alter column currency drop not null;
alter table public.bookings alter column total_freight drop not null;
alter table public.bookings alter column commission drop not null;
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
revoke all on function public.create_booking_record(jsonb) from public;
grant execute on function public.create_booking_record(jsonb) to authenticated;
commit;
