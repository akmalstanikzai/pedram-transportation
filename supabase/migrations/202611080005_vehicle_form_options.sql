begin;

alter table public.vehicles add column if not exists vehicle_condition text;

-- Extend the installed Fleet save function without replacing its branch and
-- access checks or the prior model-year and capacity changes.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.save_fleet_record(text,uuid,uuid,jsonb,timestamptz)'::regprocedure);
  if position('notes,vehicle_condition,branch_id' in definition) = 0 then
    if position('notes,branch_id,archived_at,created_by)' in definition) = 0 then
      raise exception 'Unexpected save_fleet_record definition';
    end if;
    definition := replace(definition,
      'notes,branch_id,archived_at,created_by)',
      'notes,vehicle_condition,branch_id,archived_at,created_by)');
    definition := replace(definition,
      'trim(p_data->>''notes''),bid,archived,auth.uid())',
      'trim(p_data->>''notes''),nullif(trim(p_data->>''vehicle_condition''),''''),bid,archived,auth.uid())');
    definition := replace(definition,
      'permit_expiry=excluded.permit_expiry,notes=excluded.notes,archived_at=excluded.archived_at',
      'permit_expiry=excluded.permit_expiry,notes=excluded.notes,vehicle_condition=excluded.vehicle_condition,archived_at=excluded.archived_at');
    execute definition;
  end if;
end; $$;

-- The fourth vehicle document slot uses the existing protected storage flow.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.reserve_fleet_document(uuid,text,uuid,text,text,text,integer,date)'::regprocedure);
  if position('''other''' in definition) = 0 then
    if position('''booklet'',''international'')' in definition) = 0 then
      raise exception 'Unexpected reserve_fleet_document definition';
    end if;
    execute replace(definition,
      '''booklet'',''international'')',
      '''booklet'',''international'',''other'')');
  end if;
end; $$;

commit;
