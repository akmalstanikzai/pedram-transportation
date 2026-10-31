-- Drivers and vehicles are selected independently for each booking.
begin;
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
 insert into public.bookings(trader_id,vehicle_id,driver_id,booking_date,service_type,trader_first_name,trader_last_name,trader_phone,trader_address,sender_is_trader,sender_name,sender_phone,sender_address,receiver_name,receiver_phone,receiver_address,goods,weight_tons,volume_m3,origin,destination)
 values(trader,vehicle,driver,(p_data->>'booking_date')::date,p_data->>'service_type',first_name,last_name,p_data->>'trader_phone',p_data->>'trader_address',coalesce((p_data->>'sender_is_trader')::boolean,false),p_data->>'sender_name',p_data->>'sender_phone',p_data->>'sender_address',p_data->>'receiver_name',p_data->>'receiver_phone',p_data->>'receiver_address',p_data->>'goods',nullif(p_data->>'weight_tons','')::numeric,nullif(p_data->>'volume_m3','')::numeric,p_data->>'origin',p_data->>'destination') returning id into result;
 return result;
end; $$;
revoke all on function public.create_booking_record(jsonb) from public;
grant execute on function public.create_booking_record(jsonb) to authenticated;

-- Booking vehicle_id and driver_id are retained as the historical pairing.
-- Only the old permanent/default assignment is removed; no drivers are deleted.
alter table public.drivers drop column if exists vehicle_id;
comment on column public.bookings.vehicle_id is 'Vehicle selected for this booking only.';
comment on column public.bookings.driver_id is 'Driver selected independently for this booking only.';
commit;

