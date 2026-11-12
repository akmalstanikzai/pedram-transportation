begin;

alter table public.vehicles add column if not exists gross_weight_kg numeric(12,3),
 add column if not exists empty_weight_kg numeric(12,3);
alter table public.vehicles drop constraint if exists vehicles_gross_empty_weights_check;
alter table public.vehicles add constraint vehicles_gross_empty_weights_check check (
 (gross_weight_kg is null and empty_weight_kg is null) or
 (gross_weight_kg is not null and empty_weight_kg is not null and
  gross_weight_kg>empty_weight_kg and empty_weight_kg>=0 and gross_weight_kg<1000000000)
);

-- Validate the two independent weights and derive usable cargo capacity in
-- tons before the existing Fleet save runs its booking and capacity checks.
create or replace function public.save_vehicle_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; gross numeric; empty_weight numeric; payload jsonb:=p_data;
begin
 if (p_data ? 'gross_weight_kg') is distinct from (p_data ? 'empty_weight_kg') then raise exception 'INVALID_VEHICLE_WEIGHTS'; end if;
 begin
  gross:=nullif(trim(p_data->>'gross_weight_kg'),'')::numeric;
  empty_weight:=nullif(trim(p_data->>'empty_weight_kg'),'')::numeric;
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_VEHICLE_WEIGHTS'; end;
 if p_id is not null and not (p_data ? 'gross_weight_kg') then
  select v.gross_weight_kg,v.empty_weight_kg into gross,empty_weight from public.vehicles v where v.id=p_id;
 end if;
 if (gross is null) is distinct from (empty_weight is null) then raise exception 'INVALID_VEHICLE_WEIGHTS'; end if;
 if gross is not null then
  if gross::text in ('NaN','Infinity','-Infinity') or empty_weight::text in ('NaN','Infinity','-Infinity')
   or gross<=empty_weight or empty_weight<0 or gross>=1000000000
   or round(gross,3)<>gross or round(empty_weight,3)<>empty_weight then raise exception 'INVALID_VEHICLE_WEIGHTS'; end if;
  payload:=payload||jsonb_build_object('capacity_tons',(gross-empty_weight)/1000);
 end if;
 result:=public.save_fleet_record('vehicle',p_id,p_request,payload,p_expected);
 update public.vehicles set
  gross_weight_kg=case when p_data ? 'gross_weight_kg' then gross else gross_weight_kg end,
  empty_weight_kg=case when p_data ? 'empty_weight_kg' then empty_weight else empty_weight_kg end
 where id=result and (
  (p_data ? 'gross_weight_kg' and gross_weight_kg is distinct from gross) or
  (p_data ? 'empty_weight_kg' and empty_weight_kg is distinct from empty_weight)
 );
 return result;
end; $$;

revoke all on function public.save_vehicle_record(uuid,uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.save_vehicle_record(uuid,uuid,jsonb,timestamptz) to authenticated;
commit;
