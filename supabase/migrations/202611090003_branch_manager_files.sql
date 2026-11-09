begin;
create table public.branch_manager_files (
 id uuid primary key,
 branch_id uuid not null references public.branches(id),
 document_type text not null check(document_type in ('photo','doc1','doc2','doc3','doc4')),
 file_name text not null,
 storage_path text not null unique,
 mime_type text not null,
 file_size integer not null check(file_size>0 and file_size<=5242880),
 state text not null default 'pending' check(state in ('pending','ready')),
 created_at timestamptz not null default now()
);
create index branch_manager_files_branch_idx on public.branch_manager_files(branch_id,document_type,created_at desc);
alter table public.branch_manager_files enable row level security;
create policy branch_manager_files_read on public.branch_manager_files for select to authenticated using(public.is_president_user());
grant select on public.branch_manager_files to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('branch-manager-files','branch-manager-files',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function public.reserve_branch_manager_file(p_id uuid,p_branch uuid,p_type text,p_name text,p_mime text,p_size integer) returns text
language plpgsql security definer set search_path='' as $$
declare path text; ext text:=lower(reverse(split_part(reverse(p_name),'.',1))); prior public.branch_manager_files;
begin
 if not public.is_president_user() or not exists(select 1 from public.branches where id=p_branch) then raise exception 'ACCESS_DENIED'; end if;
 if p_type not in ('photo','doc1','doc2','doc3','doc4')
    or p_size is null or p_size<=0 or p_size>5242880 or length(p_name)>255
    or not ((p_type='photo' and ext in ('jpg','jpeg','png','webp')) or (p_type<>'photo' and ext in ('pdf','jpg','jpeg','png','webp')))
    or p_mime is distinct from (case ext when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp' end) then
  raise exception 'INVALID_FILE';
 end if;
 path:=p_branch::text||'/'||p_type||'/'||p_id::text||'.'||ext;
 select * into prior from public.branch_manager_files where id=p_id;
 if found then
  if prior.branch_id<>p_branch or prior.document_type<>p_type or prior.storage_path<>path or prior.file_name<>p_name or prior.mime_type<>p_mime or prior.file_size<>p_size then raise exception 'REQUEST_CONFLICT'; end if;
  return path;
 end if;
 insert into public.branch_manager_files(id,branch_id,document_type,file_name,storage_path,mime_type,file_size)
 values(p_id,p_branch,p_type,p_name,path,p_mime,p_size);
 return path;
end; $$;
create function public.complete_branch_manager_file(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare file public.branch_manager_files;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 select * into file from public.branch_manager_files where id=p_id for update;
 if not found or not exists(select 1 from storage.objects where bucket_id='branch-manager-files' and name=file.storage_path) then raise exception 'INVALID_FILE'; end if;
 update public.branch_manager_files set state='ready' where id=p_id;
end; $$;
revoke all on function public.reserve_branch_manager_file(uuid,uuid,text,text,text,integer),public.complete_branch_manager_file(uuid) from public,anon;
grant execute on function public.reserve_branch_manager_file(uuid,uuid,text,text,text,integer),public.complete_branch_manager_file(uuid) to authenticated;
create policy branch_manager_object_read on storage.objects for select to authenticated using(bucket_id='branch-manager-files' and public.is_president_user());
create policy branch_manager_object_insert on storage.objects for insert to authenticated with check(bucket_id='branch-manager-files' and public.is_president_user() and exists(select 1 from public.branch_manager_files f where f.storage_path=name and f.state='pending'));
create policy branch_manager_object_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'branch-manager-files' or public.is_president_user());
create policy branch_manager_object_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'branch-manager-files' or (public.is_president_user() and exists(select 1 from public.branch_manager_files f where f.storage_path=name and f.state='pending')));
commit;
