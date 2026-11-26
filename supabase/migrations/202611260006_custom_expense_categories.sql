begin;

alter table pedram_private.office_expenses
 add column custom_category text check (
  custom_category is null or (category='other' and char_length(btrim(custom_category)) between 1 and 80)
 );

create function public.save_custom_office_expense(
 p_request uuid,p_branch uuid,p_custom_category text,p_currency text,p_description text,
 p_date date,p_amount numeric,p_payee_type text default null,p_payee_name text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 category_name text:=btrim(coalesce(p_custom_category,''));
 existing_category text;
 retry boolean;
begin
 if not public.operations_access(p_branch) then raise exception 'ACCESS_DENIED'; end if;
 if p_request is null then raise exception 'INVALID_ENTRY'; end if;
 if char_length(category_name) not between 1 and 80 then raise exception 'INVALID_EXPENSE_CATEGORY'; end if;

 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select custom_category into existing_category from pedram_private.office_expenses where id=p_request;
 retry:=found;
 perform pedram_private.record_office_expense(
  p_request,p_branch,'other',p_currency,p_description,p_date,p_amount,null,p_payee_type,p_payee_name);
 if retry then
  if existing_category is distinct from category_name then raise exception 'REQUEST_CONFLICT'; end if;
 else
  update pedram_private.office_expenses set custom_category=category_name where id=p_request;
 end if;
 return p_request;
end; $$;
revoke all on function public.save_custom_office_expense(uuid,uuid,text,text,text,date,numeric,text,text) from public,anon;
grant execute on function public.save_custom_office_expense(uuid,uuid,text,text,text,date,numeric,text,text) to authenticated;

create or replace function public.company_expenses(p_all boolean,p_branch uuid,p_start date,p_end date)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'payments',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object(
    'payee_type',expense.payee_type,'payee_name',expense.payee_name,'custom_category',expense.custom_category,
    'description',case when expense.payee_type is not null and r.direction='out'
     then expense.description else r.description end
   ) order by r.entry_date desc,r.receipt_number desc)
 from pedram_private.expense_cashbook_rows r
 left join pedram_private.office_expenses expense on expense.id=r.expense_id
 where public.cashbook_access(r.branch_id) and (p_all or r.branch_id is not distinct from p_branch)
 and r.entry_date between p_start and p_end and (r.category<>'salary' or public.is_president_user())), '[]'::jsonb),
 'bills',coalesce((select jsonb_agg(to_jsonb(b)-'created_by' order by b.due_on,b.id)
 from pedram_private.office_bills_due b
 where public.cashbook_access(b.branch_id) and (p_all or b.branch_id is not distinct from p_branch)
 and b.remaining>0),'[]'::jsonb));
$$;

commit;
