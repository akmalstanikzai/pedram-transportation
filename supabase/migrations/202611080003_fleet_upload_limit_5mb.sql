begin;

-- Apply the limit to the storage bucket and the protected reservation RPC.
-- Existing files remain stored and readable.
update storage.buckets
set file_size_limit = 5242880
where id = 'fleet-documents';

do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.reserve_fleet_document(uuid,text,uuid,text,text,text,integer,date)'::regprocedure);
  if position('p_size>20971520' in definition) > 0 then
    execute replace(definition, 'p_size>20971520', 'p_size>5242880');
  elsif position('p_size>5242880' in definition) = 0 then
    raise exception 'Unexpected reserve_fleet_document definition';
  end if;
end; $$;

commit;
