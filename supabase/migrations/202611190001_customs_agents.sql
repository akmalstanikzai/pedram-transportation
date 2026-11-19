begin;

create table public.customs_agents (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 1 and 150),
 father_name text not null default '' check(length(father_name)<=150),
 phone text not null check(length(phone) between 1 and 40),
 province text not null default '' check(length(province)<=100),
 district text not null default '' check(length(district)<=100),
 village text not null default '' check(length(village)<=150),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create trigger customs_agents_updated_at before update on public.customs_agents
for each row execute procedure public.set_updated_at();
alter table public.customs_agents enable row level security;
create policy customs_agents_read on public.customs_agents for select to authenticated using(public.is_president_user());
revoke all on public.customs_agents from public,anon,authenticated;
grant select on public.customs_agents to authenticated;

create function public.save_customs_agent(p_id uuid,p_data jsonb,p_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare proposed public.customs_agents; prior public.customs_agents;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if p_id is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'REQUIRED_FIELDS'; end if;
 proposed.name:=btrim(coalesce(p_data->>'name',''));
 proposed.father_name:=btrim(coalesce(p_data->>'father_name',''));
 proposed.phone:=btrim(coalesce(p_data->>'phone',''));
 proposed.province:=btrim(coalesce(p_data->>'province',''));
 proposed.district:=btrim(coalesce(p_data->>'district',''));
 proposed.village:=btrim(coalesce(p_data->>'village',''));
 if proposed.name='' or proposed.phone='' then raise exception 'REQUIRED_FIELDS'; end if;
 if p_updated_at is null then
  insert into public.customs_agents(id,name,father_name,phone,province,district,village)
  values(p_id,proposed.name,proposed.father_name,proposed.phone,proposed.province,proposed.district,proposed.village)
  on conflict(id) do nothing returning * into prior;
  if found then return to_jsonb(prior); end if;
 end if;
 select * into prior from public.customs_agents where id=p_id for update;
 if not found then raise exception 'STALE_RECORD'; end if;
 -- A retry after a lost response must not create another person or overwrite
 -- newer information. Identical values are already a successful save.
 if (prior.name,prior.father_name,prior.phone,prior.province,prior.district,prior.village)
    is not distinct from (proposed.name,proposed.father_name,proposed.phone,proposed.province,proposed.district,proposed.village) then return to_jsonb(prior); end if;
 if p_updated_at is null then raise exception 'REQUEST_CONFLICT'; end if;
 if prior.updated_at is distinct from p_updated_at then raise exception 'STALE_RECORD'; end if;
 update public.customs_agents set name=proposed.name,father_name=proposed.father_name,phone=proposed.phone,
  province=proposed.province,district=proposed.district,village=proposed.village where id=p_id returning * into prior;
 return to_jsonb(prior);
end; $$;

create table public.customs_agent_files (
 id uuid primary key,
 agent_id uuid not null references public.customs_agents(id),
 document_type text not null check(document_type in ('identity','photo','other1','other2')),
 file_name text not null,
 storage_path text not null unique,
 mime_type text not null,
 file_size integer not null check(file_size>0 and file_size<=5242880),
 state text not null default 'pending' check(state in ('pending','ready')),
 created_at timestamptz not null default now()
);
create index customs_agent_files_agent_idx on public.customs_agent_files(agent_id,document_type,created_at desc);
alter table public.customs_agent_files enable row level security;
create policy customs_agent_files_read on public.customs_agent_files for select to authenticated using(public.is_president_user());
revoke all on public.customs_agent_files from public,anon,authenticated;
grant select on public.customs_agent_files to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customs-agent-files','customs-agent-files',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function public.reserve_customs_agent_file(p_id uuid,p_agent uuid,p_type text,p_name text,p_mime text,p_size integer)
returns text language plpgsql security definer set search_path='' as $$
declare path text; ext text:=lower(reverse(split_part(reverse(p_name),'.',1))); prior public.customs_agent_files;
begin
 if not public.is_president_user() or not exists(select 1 from public.customs_agents where id=p_agent) then raise exception 'ACCESS_DENIED'; end if;
 if p_id is null or p_type is null or p_type not in ('identity','photo','other1','other2')
    or p_name is null or length(p_name) not between 1 and 255 or p_size is null or p_size<=0 or p_size>5242880
    or not ((p_type='photo' and ext in ('jpg','jpeg','png','webp')) or (p_type<>'photo' and ext in ('pdf','jpg','jpeg','png','webp')))
    or p_mime is null or p_mime is distinct from (case ext when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp' end) then raise exception 'INVALID_FILE'; end if;
 path:=p_agent::text||'/'||p_type||'/'||p_id::text||'.'||ext;
 insert into public.customs_agent_files(id,agent_id,document_type,file_name,storage_path,mime_type,file_size)
 values(p_id,p_agent,p_type,p_name,path,p_mime,p_size) on conflict(id) do nothing;
 select * into prior from public.customs_agent_files where id=p_id;
 if prior.agent_id<>p_agent or prior.document_type<>p_type or prior.storage_path<>path or prior.file_name<>p_name or prior.mime_type<>p_mime or prior.file_size<>p_size then raise exception 'REQUEST_CONFLICT'; end if;
 return path;
end; $$;

create function public.complete_customs_agent_file(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare file public.customs_agent_files;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 select * into file from public.customs_agent_files where id=p_id for update;
 if not found or not exists(select 1 from storage.objects where bucket_id='customs-agent-files' and name=file.storage_path) then raise exception 'INVALID_FILE'; end if;
 update public.customs_agent_files set state='ready' where id=p_id;
end; $$;
revoke all on function public.save_customs_agent(uuid,jsonb,timestamptz),public.reserve_customs_agent_file(uuid,uuid,text,text,text,integer),public.complete_customs_agent_file(uuid) from public,anon;
grant execute on function public.save_customs_agent(uuid,jsonb,timestamptz),public.reserve_customs_agent_file(uuid,uuid,text,text,text,integer),public.complete_customs_agent_file(uuid) to authenticated;

create policy customs_object_read on storage.objects for select to authenticated
using(bucket_id='customs-agent-files' and public.is_president_user());
create policy customs_object_insert on storage.objects for insert to authenticated
with check(bucket_id='customs-agent-files' and public.is_president_user() and exists(select 1 from public.customs_agent_files f where f.storage_path=name and f.state='pending'));
-- These guards also apply if another module has a permissive storage policy.
create policy customs_object_read_guard on storage.objects as restrictive for select to authenticated
using(bucket_id<>'customs-agent-files' or public.is_president_user());
create policy customs_object_insert_guard on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'customs-agent-files' or (public.is_president_user() and exists(select 1 from public.customs_agent_files f where f.storage_path=name and f.state='pending')));
create policy customs_object_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'customs-agent-files') with check(bucket_id<>'customs-agent-files');
create policy customs_object_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'customs-agent-files');
create policy customs_object_no_anonymous_access on storage.objects as restrictive for all to anon
using(bucket_id<>'customs-agent-files') with check(bucket_id<>'customs-agent-files');

commit;
