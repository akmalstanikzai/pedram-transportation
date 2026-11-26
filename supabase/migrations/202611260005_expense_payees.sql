begin;

alter table pedram_private.office_expenses
 add column payee_type text,
 add column payee_name text,
 add constraint office_expenses_payee_check check (
  (payee_type is null and payee_name is null)
  or (payee_type is not distinct from 'office' and payee_name is null)
  or (payee_type is not distinct from 'miscellaneous' and payee_name is not null
      and char_length(btrim(payee_name)) between 1 and 100)
 ),
 drop constraint office_expenses_category_check,
 add constraint office_expenses_category_check
  check (category in ('food','electricity','rent','fuel','maintenance','internet','supplies','labour','other'));

-- Keep original expense details and the payee structured for history. The
-- Cashbook description carries the payee on screen and when printed.
create function pedram_private.record_office_expense(
 p_request uuid,p_branch uuid,p_category text,p_currency text,p_description text,
 p_date date,p_amount numeric,p_due date,p_payee_type text,p_payee_name text
) returns uuid language plpgsql set search_path='' as $$
declare prior pedram_private.office_expenses;
 details text:=btrim(coalesce(p_description,''));
 payee text:=nullif(btrim(p_payee_name),'');
 receipt_description text;
begin
 if not public.operations_access(p_branch) then raise exception 'ACCESS_DENIED'; end if;
 if p_request is null then raise exception 'INVALID_ENTRY'; end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2)
 then raise exception 'INVALID_AMOUNT'; end if;
 if p_date is null or not isfinite(p_date) or p_date>(now() at time zone 'Asia/Kabul')::date
 or (p_due is not null and (not isfinite(p_due) or p_due<p_date)) then raise exception 'INVALID_DATE'; end if;
 if char_length(details) not between 1 and 500 then raise exception 'DESCRIPTION_REQUIRED'; end if;
 if (p_payee_type='miscellaneous' and (payee is null or char_length(payee)>100))
 or (p_payee_type is distinct from 'miscellaneous' and payee is not null)
 or (p_payee_type is not null and p_payee_type not in ('miscellaneous','office'))
 then raise exception 'INVALID_EXPENSE_PAYEE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from pedram_private.office_expenses where id=p_request;
 if found then
  if (prior.created_by,prior.branch_id,prior.category,prior.currency,prior.description,prior.recorded_on,prior.amount,
      prior.due_on,prior.payee_type,prior.payee_name)
   is distinct from (auth.uid(),p_branch,p_category,p_currency,details,p_date,p_amount,p_due,p_payee_type,payee)
  then raise exception 'REQUEST_CONFLICT'; end if;
  return prior.id;
 end if;
 insert into pedram_private.office_expenses
  (id,branch_id,category,currency,description,recorded_on,due_on,amount,created_by,payee_type,payee_name)
 values (p_request,p_branch,p_category,p_currency,details,p_date,p_due,p_amount,auth.uid(),p_payee_type,payee);
 if p_due is null then
  receipt_description:=case p_payee_type
   when 'miscellaneous' then 'متفرقه: '||payee||' · '||details
   when 'office' then 'دفتر · '||details
   else details end;
  if exists(select 1 from public.cashbook_operations where id=p_request) then raise exception 'REQUEST_CONFLICT'; end if;
  perform public.cashbook_simple_post(p_request,jsonb_build_object('branch_id',p_branch,'direction','out',
   'currency',p_currency,'description',receipt_description,'date',p_date,'amount',p_amount));
  insert into pedram_private.office_expense_payments values(p_request,p_request);
 end if;
 return p_request;
end; $$;
revoke all on function pedram_private.record_office_expense(uuid,uuid,text,text,text,date,numeric,date,text,text)
 from public,anon,authenticated;

create or replace function public.save_office_expense(
 p_request uuid,p_branch uuid,p_category text,p_currency text,p_description text,
 p_date date,p_amount numeric,p_due date default null
) returns uuid language sql security definer set search_path='' as $$
 select pedram_private.record_office_expense(
  p_request,p_branch,p_category,p_currency,p_description,p_date,p_amount,p_due,null,null);
$$;

create function public.save_paid_office_expense(
 p_request uuid,p_branch uuid,p_category text,p_currency text,p_description text,
 p_date date,p_amount numeric,p_payee_type text default null,p_payee_name text default null
) returns uuid language sql security definer set search_path='' as $$
 select pedram_private.record_office_expense(
  p_request,p_branch,p_category,p_currency,p_description,p_date,p_amount,null,p_payee_type,p_payee_name);
$$;
revoke all on function public.save_paid_office_expense(uuid,uuid,text,text,text,date,numeric,text,text) from public,anon;
grant execute on function public.save_paid_office_expense(uuid,uuid,text,text,text,date,numeric,text,text) to authenticated;

create or replace function public.company_expenses(p_all boolean,p_branch uuid,p_start date,p_end date)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'payments',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object(
    'payee_type',expense.payee_type,'payee_name',expense.payee_name,
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
