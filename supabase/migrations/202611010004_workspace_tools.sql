-- Only workspace search, account profile editing and notification queries.
-- Does not change any business workflow or existing operational grants.
begin;
create function public.update_my_profile(p_full_name text,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.profiles;
begin
 if auth.uid() is null then raise exception 'ACCESS_DENIED'; end if;
 if coalesce(trim(p_full_name),'')='' or length(trim(p_full_name))>160 or length(coalesce(p_phone,''))>40 then raise exception 'REQUIRED_FIELDS'; end if;
 update public.profiles set full_name=trim(p_full_name),phone=nullif(trim(p_phone),'') where id=auth.uid() and account_enabled returning * into result;
 if not found then raise exception 'ACCOUNT_DISABLED'; end if;
 return jsonb_build_object('id',result.id,'full_name',result.full_name,'phone',result.phone);
end; $$;
revoke all on function public.update_my_profile(text,text) from public,anon;
grant execute on function public.update_my_profile(text,text) to authenticated;

create function public.search_workspace(p_query text,p_category text default 'all',p_limit integer default 30)
returns table(category text,id uuid,label text,detail text,destination text)
language plpgsql stable security invoker set search_path='' as $$
declare actor_role public.app_role;
begin
 select p.role into actor_role from public.profiles p where p.id=auth.uid() and p.account_enabled;
 if actor_role is null then raise exception 'ACCOUNT_DISABLED'; end if;
 if length(trim(coalesce(p_query,'')))<2 or length(p_query)>100 then return; end if;
 if p_category is null or p_category not in ('all','vehicles','owners','drivers','branches','bookings','traders','documents','cashbook') then raise exception 'ACCESS_DENIED'; end if;
 return query
 with searchable as (
  select 'vehicles'::text category,v.id,v.plate_number label,concat_ws(' · ',v.vehicle_type,v.vin_number) detail,'#/vehicles/view/'||v.id destination,concat_ws(' ',v.plate_number,v.foreign_plate_number,v.vin_number,v.vehicle_type,v.color) haystack from public.vehicles v
  union all select 'owners',o.id,o.full_name,concat_ws(' · ',o.phone,o.province),'#/owners/view/'||o.id,concat_ws(' ',o.full_name,o.phone,o.national_id,o.address,o.province) from public.vehicle_owners o
  union all select 'drivers',d.id,d.full_name,concat_ws(' · ',d.phone,d.license_number),'#/drivers/view/'||d.id,concat_ws(' ',d.full_name,d.phone,d.national_id,d.license_number,d.address) from public.drivers d
  union all select 'branches',b.id,b.name,concat_ws(' · ',b.city,b.province),'#/branches/view/'||b.id,concat_ws(' ',b.name,b.city,b.province,b.phone,b.address) from public.branches b
  union all select 'bookings',b.id,'#'||b.booking_number||' · '||coalesce(b.trader_first_name,''),concat_ws(' → ',b.origin,b.destination),'#/bookings/view/'||b.id,concat_ws(' ',b.booking_number,b.trader_first_name,b.trader_last_name,b.trader_phone,b.sender_name,b.sender_phone,b.receiver_name,b.receiver_phone,b.origin,b.destination,b.goods,v.plate_number,r.full_name) from public.bookings b left join public.vehicles v on v.id=b.vehicle_id left join public.drivers r on r.id=b.driver_id
  union all select 'traders',t.id,t.full_name,concat_ws(' · ',t.phone,t.address),'#/bookings?trader='||t.id,concat_ws(' ',t.full_name,t.first_name,t.last_name,t.phone,t.address) from public.traders t
  union all select 'documents',d.id,d.file_name,concat_ws(' · ',d.document_type,v.plate_number,o.full_name,r.full_name),
   case when d.vehicle_id is not null then '#/vehicles/documents/'||d.vehicle_id when d.owner_id is not null then '#/owners/documents/'||d.owner_id else '#/drivers/documents/'||d.driver_id end||'?document='||d.id,
   concat_ws(' ',d.file_name,d.document_type,v.plate_number,o.full_name,r.full_name) from public.vehicle_documents d left join public.vehicles v on v.id=d.vehicle_id left join public.vehicle_owners o on o.id=d.owner_id left join public.drivers r on r.id=d.driver_id where d.state='ready'
  union all select 'cashbook',e.id,e.description,concat_ws(' · ',e.entry_date,e.amount,a.currency),'#/cashbook?entry='||e.id||'&scope='||coalesce(a.branch_id::text,'admin')||'&currency='||a.currency,concat_ws(' ',e.description,e.party,e.reference,e.entry_date,e.amount,a.currency) from public.cashbook_entries e join public.cashbook_accounts a on a.id=e.account_id
 )
 select s.category,s.id,s.label,s.detail,s.destination from searchable s
 where (p_category='all' or s.category=p_category)
 and (actor_role<>'driver' or s.category='bookings')
 and not exists(select 1 from unnest(regexp_split_to_array(lower(trim(p_query)),'\s+')) token where strpos(lower(s.haystack),token)=0)
 order by case when strpos(lower(s.label),lower(trim(p_query)))=1 then 0 else 1 end,s.category,s.label,s.id
 limit greatest(1,least(coalesce(p_limit,30),50));
end; $$;
revoke all on function public.search_workspace(text,text,integer) from public,anon;
grant execute on function public.search_workspace(text,text,integer) to authenticated;

create function public.workspace_alerts(p_days integer default 14)
returns table(category text,id uuid,label text,detail text,destination text,event_date date)
language plpgsql stable security invoker set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Kabul')::date; horizon integer:=greatest(1,least(coalesce(p_days,14),90));
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_enabled) then raise exception 'ACCOUNT_DISABLED'; end if;
 return query
 select 'documents'::text,d.id,d.file_name,d.document_type,
  case when d.vehicle_id is not null then '#/vehicles/documents/'||d.vehicle_id when d.owner_id is not null then '#/owners/documents/'||d.owner_id else '#/drivers/documents/'||d.driver_id end||'?document='||d.id,d.expires_on
 from public.vehicle_documents d where d.state='ready' and d.expires_on<=today+horizon
 union all
 select 'bookings',b.id,'#'||b.booking_number,concat_ws(' → ',b.origin,b.destination),'#/bookings/view/'||b.id,b.departure_date
 from public.bookings b where b.status in ('confirmed','in_transit') and b.departure_date between today and today+horizon
 order by 6,2 limit 100;
end; $$;
revoke all on function public.workspace_alerts(integer) from public,anon;
grant execute on function public.workspace_alerts(integer) to authenticated;
commit;
