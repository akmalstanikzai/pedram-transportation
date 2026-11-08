begin;

-- Permit a driver passport in the existing private document upload workflow.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.reserve_fleet_document(uuid,text,uuid,text,text,text,integer,date)'::regprocedure);
  if position('p_type not in (''profile_photo'',''identity'',''licence'',''health'',''contract'')' in definition) > 0 then
    execute replace(definition,
      'p_type not in (''profile_photo'',''identity'',''licence'',''health'',''contract'')',
      'p_type not in (''profile_photo'',''identity'',''passport'',''licence'',''health'',''contract'')');
  elsif position('p_type not in (''identity'',''licence'',''health'',''contract'')' in definition) > 0 then
    execute replace(definition,
      'p_type not in (''identity'',''licence'',''health'',''contract'')',
      'p_type not in (''identity'',''passport'',''licence'',''health'',''contract'')');
  elsif position('p_type not in (''profile_photo'',''identity'',''passport''' in definition) = 0 then
    raise exception 'Unexpected reserve_fleet_document definition';
  end if;
end; $$;

commit;
