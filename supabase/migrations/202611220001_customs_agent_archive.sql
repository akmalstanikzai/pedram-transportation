begin;

alter table public.customs_agents add column archived_at timestamptz;

create function public.set_customs_agent_archived(p_agent uuid, p_archived boolean, p_expected timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare current_agent public.customs_agents;
begin
 if not public.is_president_user() then raise exception 'ACCESS_DENIED'; end if;
 if p_archived is null then raise exception 'REQUIRED_FIELDS'; end if;
 select * into current_agent from public.customs_agents where id=p_agent for update;
 if not found then raise exception 'STALE_RECORD'; end if;
 if (current_agent.archived_at is not null)=p_archived then return; end if;
 if current_agent.updated_at is distinct from p_expected then raise exception 'STALE_RECORD'; end if;
 update public.customs_agents
 set archived_at=case when p_archived then now() else null end
 where id=p_agent;
end; $$;

revoke all on function public.set_customs_agent_archived(uuid,boolean,timestamptz) from public,anon;
grant execute on function public.set_customs_agent_archived(uuid,boolean,timestamptz) to authenticated;
commit;
