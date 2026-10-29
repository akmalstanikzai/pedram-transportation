alter table public.vehicles add column if not exists foreign_plate_number text;
alter table public.vehicles add column if not exists vin_number text;
alter table public.vehicle_owners add column if not exists province text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('fleet-documents', 'fleet-documents', false, 20971520)
on conflict (id) do nothing;

create policy "Management can read fleet documents" on storage.objects
for select to authenticated
using (bucket_id = 'fleet-documents' and public.is_management_user());

create policy "Management can upload fleet documents" on storage.objects
for insert to authenticated
with check (bucket_id = 'fleet-documents' and public.is_management_user());
