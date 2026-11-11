-- Preserve existing branch fields and generic uploads while adding the new form data.
begin;
alter table public.branches add column if not exists code text;
alter table public.profiles
 add column if not exists first_name text,
 add column if not exists surname text,
 add column if not exists home_province text,
 add column if not exists home_district text,
 add column if not exists home_village text;

create or replace function public.save_branch_record(p_id uuid,p_request uuid,p_data jsonb,p_expected timestamptz default null,p_manager uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior uuid; result uuid:=coalesce(p_id,gen_random_uuid()); b public.branches; manager uuid; payload jsonb:=jsonb_build_object('id',p_id,'data',p_data,'manager',p_manager);
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 prior:=pedram_private.request_result(p_request,'branch',payload); if prior is not null then return prior; end if;
 if coalesce(trim(p_data->>'name'),'')='' or coalesce(trim(p_data->>'province'),'')='' or coalesce(trim(p_data->>'city'),'')='' then raise exception 'REQUIRED_FIELDS'; end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_data->>'name'))||lower(trim(p_data->>'province'))||lower(trim(p_data->>'city')),5));
 if exists(select 1 from public.branches where id<>result and lower(trim(name))=lower(trim(p_data->>'name')) and lower(trim(province))=lower(trim(p_data->>'province')) and lower(trim(city))=lower(trim(p_data->>'city'))) then raise exception 'DUPLICATE_RECORD'; end if;
 if p_id is not null then
  select * into b from public.branches where id=p_id for update;
  if not found or p_expected is null or p_expected<>b.updated_at then raise exception 'STALE_RECORD'; end if;
 end if;
 manager:=coalesce(p_manager,nullif(p_data->>'manager_user_id','')::uuid);
 if manager is not null then
  perform 1 from public.profiles where id=manager for update;
  if not exists(select 1 from public.profiles where id=manager and role='branch_manager') then raise exception 'ACCESS_DENIED'; end if;
  if exists(select 1 from public.branches where manager_user_id=manager and id<>result and archived_at is null) then raise exception 'MANAGER_ASSIGNED'; end if;
 end if;
 if coalesce((p_data->>'archived')::boolean,false) and exists(select 1 from public.bookings where branch_id=result and status in ('confirmed','in_transit')) then raise exception 'RECORD_IN_USE'; end if;
 insert into public.branches(id,name,code,province,city,address,phone,manager_user_id,archived_at,creation_request,created_by)
 values(result,trim(p_data->>'name'),nullif(trim(p_data->>'code'),''),trim(p_data->>'province'),trim(p_data->>'city'),trim(p_data->>'address'),trim(p_data->>'phone'),manager,case when coalesce((p_data->>'archived')::boolean,false) then now() else null end,p_request,auth.uid())
 on conflict(id) do update set name=excluded.name,code=case when p_data ? 'code' then excluded.code else public.branches.code end,province=excluded.province,city=excluded.city,address=excluded.address,phone=excluded.phone,manager_user_id=excluded.manager_user_id,archived_at=excluded.archived_at;
 if b.manager_user_id is not null and b.manager_user_id is distinct from manager then update public.profiles set branch_id=null,account_enabled=false where id=b.manager_user_id; end if;
 if manager is not null then
  update public.profiles set branch_id=result,account_enabled=not coalesce((p_data->>'archived')::boolean,false) and coalesce((p_data->>'manager_enabled')::boolean,true),full_name=coalesce(nullif(trim(p_data->>'manager_name'),''),full_name),phone=coalesce(nullif(trim(p_data->>'manager_phone'),''),phone),father_name=coalesce(p_data->>'father_name',father_name),national_id=coalesce(p_data->>'national_id',national_id),address=coalesce(p_data->>'manager_address',address),first_name=coalesce(p_data->>'manager_first_name',first_name),surname=coalesce(p_data->>'manager_surname',surname),home_province=coalesce(p_data->>'home_province',home_province),home_district=coalesce(p_data->>'home_district',home_district),home_village=coalesce(p_data->>'home_village',home_village) where id=manager;
 end if;
 perform pedram_private.remember(p_request,'branch',payload,result); return result;
end; $$;

alter table public.branch_manager_files drop constraint branch_manager_files_document_type_check;
alter table public.branch_manager_files add constraint branch_manager_files_document_type_check
 check(document_type in ('photo','doc1','doc2','doc3','doc4','identity','cv','education','contract','extra'));

create or replace function public.reserve_branch_manager_file(p_id uuid,p_branch uuid,p_type text,p_name text,p_mime text,p_size integer) returns text
language plpgsql security definer set search_path='' as $$
declare path text; ext text:=lower(reverse(split_part(reverse(p_name),'.',1))); prior public.branch_manager_files;
begin
 if not public.is_president_user() or not exists(select 1 from public.branches where id=p_branch) then raise exception 'ACCESS_DENIED'; end if;
 if p_type not in ('photo','doc1','doc2','doc3','doc4','identity','cv','education','contract','extra')
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

commit;
