begin;

-- Model year is a label: accept any digits, including non-Gregorian years,
-- leading zeroes and values beyond JavaScript/PostgreSQL integer precision.
alter table public.vehicles drop constraint if exists vehicles_model_year_check;
alter table public.vehicles alter column model_year type text using model_year::text;
alter table public.vehicles add constraint vehicles_model_year_check
 check (model_year is null or model_year ~ '^[0-9]+$');

-- Preserve the installed branch/security workflow, changing only its year cast.
do $$
declare definition text;
 old_expression text := 'nullif(p_data->>''model_year'','''')::integer';
 new_expression text := 'nullif(trim(p_data->>''model_year''),'''')';
begin
 definition := pg_get_functiondef('public.save_fleet_record(text,uuid,uuid,jsonb,timestamptz)'::regprocedure);
 if position(old_expression in definition) > 0 then
  execute replace(definition,old_expression,new_expression);
 elsif position(new_expression in definition) = 0 then
  raise exception 'Unexpected save_fleet_record definition; model year migration was not applied';
 end if;
end; $$;

commit;
