begin;

-- Extend the existing protected document upload workflow without changing
-- document access rules or existing records.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.reserve_fleet_document(uuid,text,uuid,text,text,text,integer,date)'::regprocedure);
  if position('p_type not in (''photos'',''permit'',''card'',''booklet'',''international'')' in definition) > 0 then
    definition := replace(definition,
      'p_type not in (''photos'',''permit'',''card'',''booklet'',''international'')',
      'p_type not in (''profile_photo'',''photos'',''permit'',''card'',''booklet'',''international'')');
    definition := replace(definition,
      'p_type<>''identity''',
      'p_type not in (''profile_photo'',''identity'')');
    definition := replace(definition,
      'p_type not in (''identity'',''licence'',''health'',''contract'')',
      'p_type not in (''profile_photo'',''identity'',''licence'',''health'',''contract'')');
    definition := replace(definition,
      'if (p_kind=''vehicle'' and p_type',
      'if (p_type=''profile_photo'' and ext not in (''png'',''jpg'',''jpeg'',''webp'')) or (p_kind=''vehicle'' and p_type');
    execute definition;
  elsif position('p_type not in (''profile_photo'',''photos''' in definition) = 0 then
    raise exception 'Unexpected reserve_fleet_document definition';
  end if;
end; $$;

commit;
