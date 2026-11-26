import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Building2, ChevronRight, ClipboardList, HandCoins, Plus, Receipt, Truck, Users, Wallet } from 'lucide-react'
import { allRows, currencies, kabulToday, payees, payeeTitleDari } from '../lib/cashbook'
import { formatSolarHijri, solarHijriToISODate, solarHijriToday } from '../lib/solarHijri'
import { rpc } from '../lib/operations'
import { supabase } from '../lib/supabase'
import { payrollMonthLabel } from '../lib/payroll'
import { cashbookRecordLink, followRecordLink, recordLink, recordQuery, recordReturnRoute, withRecordReturn } from '../lib/recordRoutes'
import SolarHijriDateInput from '../components/SolarHijriDateInput'
import { Modal } from '../components/RecordTools'
import Icon from '../components/Icon'
import './CompanyPages.css'

const categories = {
  food:['Food','خوراک'], electricity:['Electricity','بل برق'], rent:['Office rent','کرایه دفتر'],
  fuel:['Fuel','تیل'], maintenance:['Maintenance','ترمیم و نگهداری'], internet:['Internet and phone','انترنت و تلفن'],
  supplies:['Office supplies','لوازم دفتر'], labour:['Labour','کاریگر'], other:['Other','سایر'], salary:['Salary','معاش'],
  shipment:['Shipment costs','مصارف محموله'],
}
const amounts = {
  cash:['Cash balance','بیلانس'], incoming:['Money in','آمد'], outgoing:['Money out','رفت'],
  trader:['Traders owe','طلب از تاجران'], driver:['Driver commissions due','کمیسیون رانندگان'],
  customs:['Customs fees due','بدهی کمیشن‌کاران'], payroll:['Remaining payroll','معاش باقی‌مانده'],
  bills:['Outstanding bills','بل‌های پرداخت‌نشده'], expenses:['Total expenses paid','مجموع مصارف پرداخت‌شده'],
  foreignFreight:['Foreign freight paid','کرایه پرداخت‌شده موتر خارجی'], traderOut:['Paid to traders','پرداخت به تاجران'],
}
const operations = [
  ['waiting','Waiting to start','منتظر حرکت','bookings',{status:'confirmed'}],
  ['road','On the road','در راه','bookings',{status:'in_transit'}],
  ['delivery','Awaiting delivery confirmation','تحویل‌های منتظر تأیید','bookings',{attention:'deliveries'}],
  ['drivers','Active drivers','رانندگان فعال','vehicles',{drivers:1}],
  ['availableDrivers','Drivers available today','رانندگان آماده امروز','availability',{drivers:1}],
  ['availableVehicles','Vehicles available today','وسایط آماده امروز','availability'],
]
const money = value => Number(value).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})

function useCompanyData(name,args,revision=0) {
  const request = JSON.stringify(args)
  const [result,setResult] = useState(null)
  useEffect(()=>{
    let active = true
    rpc(name,JSON.parse(request)).then(data=>{
      if(active) setResult({request,revision,data})
    }).catch(()=>{
      if(active) setResult({request,revision,error:true})
    })
    return ()=>{active = false}
  },[name,request,revision])
  return result?.request===request && result.revision===revision ? result : null
}

function RecordLink({href,returnTo,className,children}) {
  return <a className={className} href={withRecordReturn(href,returnTo)} onClick={event=>followRecordLink(event,returnTo)}>{children}</a>
}

function Details({metric,scope,branch,t,currency,start,language,branchName,onClose,origin,initialPage}) {
  const [page,setPage] = useState(initialPage)
  const [revision,retry] = useState(0)
  const result = useCompanyData('company_financial_details',{
    p_metric:metric,p_all:scope==='all',p_branch:branch,p_currency:currency,p_start:start,p_offset:page*20,
  },revision)
  const payout = metric==='foreignFreight' || metric==='traderOut'
  const returnTo = origin+'&detail='+metric+(page ? '&page='+page : '')
  function link(row) {
    if (metric==='trader') return recordLink('traders',{trader:row.id,currency,account:scope==='all' ? null : scope})
    if (metric==='driver') return recordLink('bookings',{booking:row.id})
    if (metric==='payroll') return recordLink('employees',{payroll:1,row:row.id,year:row.year,month:row.month})
    if (metric==='customs') return recordLink('customs',{agent:row.related_id,fee:row.id})
    return cashbookRecordLink(row,currency)
  }
  return <Modal title={t(...amounts[metric])+' · '+currency} onClose={onClose} className="company-details-modal">
    <div className="company-details-body">
      {!result && <p role="status">{t('Loading…','در حال بارگیری…')}</p>}
      {result?.error && <p role="alert">{t('Could not load details.','جزئیات بارگیری نشد.')} <button onClick={()=>retry(i=>i+1)}>{t('Retry','تلاش دوباره')}</button></p>}
      {metric==='traderOut' && <p>{t('Includes recorded refunds to traders.','بازپرداخت‌های ثبت‌شده به تاجران نیز شامل است.')}</p>}
      {result?.data?.length===0 && <p>{t('No matching records.','معامله مطابق یافت نشد.')}</p>}
      {result?.data?.slice(0,20).map(row=>{
        const meta = [
          row.year && payrollMonthLabel(row.year,row.month,language),
          row.date && formatSolarHijri(row.date), row.number && '#'+row.number,
          row.direction && branchName(row.branch_id),
        ].filter(Boolean).join(' · ')
        const name = row.label || (row.direction==='opening' ? t('Opening balance','موجودی قبلی') : t('Cashbook activity','گردش روزنامچه'))
        return <RecordLink className="company-record" key={row.id} href={link(row)} returnTo={returnTo}>
          <span><strong>{name}</strong>{meta && <small>{meta}</small>}</span>
          <bdi dir="ltr">{((metric==='cash' && row.direction==='out') || (payout && row.direction==='in')) ? '−' : ''}{money(row.amount)}</bdi><ChevronRight size={16} aria-hidden="true"/>
        </RecordLink>
      })}
      {(page>0 || result?.data?.length>20) && <div className="company-pagination">
        <button className="registry-secondary" disabled={!page} onClick={()=>setPage(n=>n-1)}>{t('Previous','قبلی')}</button>
        <button className="registry-secondary" disabled={!(result?.data?.length>20)} onClick={()=>setPage(n=>n+1)}>{t('Next','بعدی')}</button>
      </div>}
    </div>
  </Modal>
}

function SummaryGroup({title,icon:GroupIcon,tone,children}) {
  return <section className="company-block" data-tone={tone}>
    <h2><span className="company-group-icon"><GroupIcon size={17} aria-hidden="true"/></span>{title}</h2>
    <ul>{children}</ul>
  </section>
}

function SummaryRow({label,value,href,onClick,returnTo}) {
  const content = <><span>{label}</span><bdi dir="ltr">{value}</bdi>{(href||onClick) && <ChevronRight size={14} aria-hidden="true"/>}</>
  return <li>{href ? <RecordLink href={href} returnTo={returnTo}>{content}</RecordLink> : onClick ? <button type="button" onClick={onClick}>{content}</button> : <div>{content}</div>}</li>
}

export default function CompanyPages({kind,language,profile,onBack}) {
  const t = (en,fa) => language==='fa' ? fa : en
  const destination = recordQuery()
  const president = profile.role==='president'
  const expenses = kind==='expenses'
  const legacyBills = expenses && destination.has('bills')
  const payeeView = expenses && destination.get('view')==='payees'
  const defaultScope = president ? destination.get('account') || 'all' : profile.branch_id
  const [scope,setScope] = useState(defaultScope)
  const [period,setPeriod] = useState(()=>['today','month','all'].includes(destination.get('period'))
    ? destination.get('period') : expenses ? 'all' : 'month')
  const [currency,setCurrency] = useState(()=>currencies.includes(destination.get('currency'))
    ? destination.get('currency') : expenses ? '' : 'AFN')
  const [branches,setBranches] = useState([])
  const [tab,setTab] = useState(()=>!expenses && destination.get('tab')==='operations' ? 'operations' : 'money')
  const restoredMetric = destination.get('detail')
  const [detail,setDetail] = useState(()=>!expenses && tab==='money' && Object.hasOwn(amounts,restoredMetric) &&
    restoredMetric!=='bills' && restoredMetric!=='expenses' ? {metric:restoredMetric,page:Math.max(0,parseInt(destination.get('page'),10)||0)} : null)
  const [revision,refresh] = useState(0)
  const today = kabulToday()
  const {year,month} = solarHijriToday()
  const start = period==='today' ? today : period==='month' ? solarHijriToISODate(year,month,1) : '0001-01-01'
  const all = scope==='all'
  const branch = all || scope==='admin' ? null : scope ?? null
  const args = {p_all:all,p_branch:branch,p_start:start}
  const result = useCompanyData(expenses ? 'company_expenses' : 'company_overview',expenses ? {...args,p_end:today} : args,revision)
  const data = result?.data
  const branchName = id => branches?.find(row=>row.id===id)?.name ?? (id ? t('Branch','شعبه') : t('Head office','دفتر مرکزی'))
  const branchOptions = branches?.filter(row=>!row.archived_at).map(row=><option key={row.id} value={row.id}>{row.name}</option>)
  const currencyRow = data?.money?.find(row=>row.currency===currency)
  useEffect(()=>{
    let active = true
    if (president) allRows(supabase,'branches','id,name,archived_at').then(rows=>{
      if(active) setBranches(rows)
    }).catch(()=>{if(active)setBranches(null)})
    return ()=>{active = false}
  },[president])

  function recordSaved(account,selectedCurrency,date) {
    setScope(current=>current==='all' ? current : account)
    if (currency && currency!==selectedCurrency) setCurrency(selectedCurrency)
    if (date<start) setPeriod('all')
    refresh(n=>n+1)
  }

  const scopedDestination = {account:president && !all ? scope : null,currency,period}
  const origin = recordLink(kind,{...scopedDestination,tab:tab==='operations' ? tab : null,
    view:expenses ? destination.get('view') : null,bills:legacyBills ? 1 : null,return:recordReturnRoute(destination.get('return'))})
  const summaryRow = (metric,href) => currencyRow?.[metric]!=null && <SummaryRow key={metric} label={t(...amounts[metric])}
    value={money(currencyRow[metric])} href={href} returnTo={origin} onClick={href ? undefined : ()=>setDetail({metric,page:0})}/>
  function closeDetails() {
    if (recordQuery().has('detail')) window.history.replaceState(window.history.state,'',origin)
    setDetail(null)
  }
  return <section className={`registry-page company-page${expenses && !payeeView && !legacyBills ? ' company-expenses-page' : ''}`}>
    <header className="company-header">
      {onBack && <button className="module-back" onClick={onBack}><Icon name="back" size={16}/>{t('Back','بازگشت')}</button>}
      <h1>{payeeView ? t('Payee payments',payeeTitleDari) : legacyBills ? t('Outstanding bills','بل‌های پرداخت‌نشده')
        : expenses ? t('Expenses','مصارف') : t('Company overview','خلاصه شرکت')}</h1>
    </header>
    {!expenses && <div className="company-switcher">
      <div className="company-tabs" role="group" aria-label={t('Overview','خلاصه')}>
        <button aria-pressed={tab==='money'} onClick={()=>setTab('money')}><Wallet size={16} aria-hidden="true"/>{t('Money','مالی')}</button>
        <button aria-pressed={tab==='operations'} onClick={()=>setTab('operations')}><ClipboardList size={16} aria-hidden="true"/>{t('Operations','عملیات')}</button>
      </div>
      <RecordLink className="company-payee-link" href={recordLink('expenses',{account:scopedDestination.account,view:'payees'})} returnTo={origin}>
        <HandCoins size={17} aria-hidden="true"/>{t('Payees',payeeTitleDari)}
      </RecordLink>
    </div>}
    <div className="company-filters">
      {president && <label>{t('Account','حساب')}<select value={scope} onChange={e=>setScope(e.target.value)}>
        <option value="all">{t('All branches','همه شعبه‌ها')}</option><option value="admin">{branchName(null)}</option>{branchOptions}
      </select></label>}
      {!legacyBills && tab==='money' && <>
        <label>{t('Period','دوره')}<select value={period} onChange={e=>setPeriod(e.target.value)}>
          <option value="today">{t('Today','امروز')}</option><option value="month">{t('This month','این ماه')}</option><option value="all">{t('All dates','همه تاریخ‌ها')}</option>
        </select></label>
        <label>{t('Currency','واحد پول')}<select value={currency} onChange={e=>setCurrency(e.target.value)}>
          {expenses && <option value="">{t('All','همه')}</option>}{currencies.map(c=><option key={c} value={c}>{c}</option>)}
        </select></label>
      </>}
    </div>
    {branches===null && <p role="alert">{t('Could not load branches.','شعبه‌ها بارگیری نشد.')}</p>}
    {!result && <p role="status">{t('Loading…','در حال بارگیری…')}</p>}
    {result?.error && <p role="alert">{t('Could not load records.','ریکاردها بارگیری نشد.')} <button onClick={()=>refresh(n=>n+1)}>{t('Retry','تلاش دوباره')}</button></p>}
    {payeeView ? data && <PayeeHistory rows={data.payments} {...{t,currency,branchName}} returnTo={origin} key={scope+period+currency}/>
      : expenses && <ExpenseRecords {...{t,language,president,scope,currency,branches,branchName,branchOptions,profile,today,data,legacyBills}}
        returnTo={origin} key={legacyBills ? 'bills' : 'expenses'} historyFirst={destination.get('view')==='history'} onSaved={recordSaved}/>}
    {!expenses && data && (tab==='operations' ? <div className="company-blocks">
      <SummaryGroup tone="blue" icon={ClipboardList} title={t('Bookings','بار نامه')}>
        {operations.slice(0,3).map(([id,en,fa,page,params])=><SummaryRow key={id} label={t(en,fa)} value={data.operations[id]}
          href={recordLink(page,{...params,scope:all ? null : branch || 'head-office'})} returnTo={origin}/>)}
      </SummaryGroup>
      <SummaryGroup tone="green" icon={Truck} title={t('Fleet','وسایط و رانندگان')}>
        {operations.slice(3).map(([id,en,fa,page,params])=><SummaryRow key={id} label={t(en,fa)} value={data.operations[id]}
          href={recordLink(page,params)} returnTo={origin}/>)}
      </SummaryGroup>
      <SummaryGroup tone="violet" icon={Building2} title={t('Branches','شعبه‌ها')}>
        <SummaryRow label={t('Active branches','شعبه‌های فعال')} value={data.operations.branches}
          href={president ? recordLink('branches') : null} returnTo={origin}/>
      </SummaryGroup>
    </div> : <div className="company-blocks">
      <SummaryGroup tone="blue" icon={Wallet} title={t('Cashbook','روزنامچه')}>
        {['cash','incoming','outgoing'].map(id=>summaryRow(id))}
      </SummaryGroup>
      {(currencyRow?.trader!=null || currencyRow?.driver!=null) && <SummaryGroup tone="green" icon={ArrowDownLeft} title={t('Owed to Pedram','طلب شرکت')}>
        {['trader','driver'].map(id=>summaryRow(id))}
      </SummaryGroup>}
      {(currencyRow?.customs!=null || currencyRow?.payroll!=null || Number(currencyRow?.bills)>0) && <SummaryGroup tone="amber" icon={ArrowUpRight} title={t('Pedram owes','بدهی شرکت')}>
        {['customs','payroll'].map(id=>summaryRow(id))}
        {Number(currencyRow?.bills)>0 && summaryRow('bills',recordLink('expenses',{...scopedDestination,bills:1}))}
      </SummaryGroup>}
      <SummaryGroup tone="violet" icon={Receipt} title={t('Expenses','مصارف')}>
        {summaryRow('expenses',recordLink('expenses',{...scopedDestination,view:'history'}))}
        {summaryRow('foreignFreight')}
        {summaryRow('traderOut')}
      </SummaryGroup>
    </div>)}
    {detail && <Details key={detail.metric} metric={detail.metric} initialPage={detail.page}
      {...{scope,branch,t,currency,start,language,branchName,origin}} onClose={closeDetails}/>}
  </section>
}

function ExpenseHistoryRow({row,t,branchName,returnTo,showPayeeFirst=false}) {
  const payee = payees[row.payee_type] && (row.payee_name || t(...payees[row.payee_type]))
  const category = row.custom_category || t(...categories[row.category])
  const title = showPayeeFirst ? row.payee_name || row.description : category
  return <RecordLink className="company-record" href={cashbookRecordLink(row)} returnTo={returnTo}>
    <span>
      <strong>{title}{row.direction==='in' && ' · '+t('Reversal','معکوس')}</strong>
      {title!==row.description && <small>{row.description}</small>}
      <small>{showPayeeFirst ? category : payee}{(showPayeeFirst || payee) && ' · '}
        <bdi>{formatSolarHijri(row.entry_date)}</bdi> · {branchName(row.branch_id)}</small>
    </span>
    <span className="company-record-money">
      <bdi dir="ltr">{row.direction==='in'?'−':''}{money(row.amount)} {row.currency}</bdi>
      <small>{t('Receipt','رسید')} <bdi dir="ltr">#{row.receipt_number}</bdi></small>
    </span>
    <ChevronRight size={16} aria-hidden="true"/>
  </RecordLink>
}

function PayeeHistory({rows,t,currency,branchName,returnTo}) {
  const [limits,setLimits] = useState({miscellaneous:20,office:20})
  return <div className="company-payee-history">
    {Object.entries(payees).map(([type,label])=>{
      const records = rows.filter(row=>row.payee_type===type && (!currency || row.currency===currency))
      const GroupIcon = type==='miscellaneous' ? Users : Building2
      return <section key={type} className="company-block company-payee-group" data-tone={type==='miscellaneous' ? 'violet' : 'green'}>
        <h2><span className="company-group-icon"><GroupIcon size={17} aria-hidden="true"/></span>{t(...label)}</h2>
        {records.length===0 && <p>{t('No payments for this selection.','برای این انتخاب پرداختی ثبت نشده است.')}</p>}
        {records.slice(0,limits[type]).map(row=><ExpenseHistoryRow key={row.id} {...{row,t,branchName,returnTo}} showPayeeFirst/>)}
        {records.length>limits[type] && <button type="button" className="registry-secondary company-more"
          onClick={()=>setLimits(previous=>({...previous,[type]:previous[type]+20}))}>{t('See more','مشاهده بیشتر')}</button>}
      </section>
    })}
  </div>
}

function ExpenseRecords({t,language,president,scope,currency,branches,branchName,branchOptions,profile,today,data,legacyBills,historyFirst,onSaved,returnTo}) {
  const [editing,setEditing] = useState(!historyFirst && !legacyBills)
  const [bill,setBill] = useState(null)
  const [form,setForm] = useState({date:today,category:'',customCategory:'',currency:currency || 'AFN',amount:'',description:'',account:null})
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState(null)
  const [limit,setLimit] = useState(20)
  const pending = useRef(null)
  const change = (key,value)=>setForm(previous=>({...previous,[key]:value}))
  const account = form.account ?? (scope==='all' ? 'admin' : scope)
  const branchId = president ? account==='admin' ? null : account : profile.branch_id
  const rows = data?.payments.filter(row=>!currency || row.currency===currency) ?? []
  const bills = data?.bills.filter(row=>!currency || row.currency===currency) ?? []
  const custom = form.category==='custom'

  async function save(event) {
    event.preventDefault()
    if (busy || (!president && !branchId)) return
    const description = form.description?.trim()
    if (!form.date || (!bill && (!description || !form.category || form.category==='salary' ||
        (custom && !form.customCategory.trim())))) {
      setMessage({error:true,text:t('Complete the required fields.','خانه‌های ضروری را تکمیل کنید.')})
      return
    }
    const name = bill ? 'pay_office_bill' : custom ? 'save_custom_office_expense' : 'save_paid_office_expense'
    const args = bill ? {p_bill:bill.id,p_date:form.date,p_amount:form.amount} : {
      p_branch:branchId,p_currency:form.currency,p_description:description,p_date:form.date,p_amount:form.amount,
      ...(custom ? {p_custom_category:form.customCategory.trim()} : {p_category:form.category}),
    }
    const signature = JSON.stringify(args)
    if (pending.current?.signature!==signature) pending.current={signature,id:crypto.randomUUID()}
    setBusy(true)
    setMessage(null)
    try {
      await rpc(name,{p_request:pending.current.id,...args})
      pending.current=null
      setForm(previous=>({...previous,amount:'',description:'',category:'',customCategory:''}))
      setBill(null)
      if (bill) setEditing(false)
      setLimit(20)
      onSaved((bill ? bill.branch_id : branchId) || 'admin',bill?.currency || form.currency,form.date)
      window.dispatchEvent(new Event('pedram:cashbook-changed'))
      setMessage({text:t('Saved as Money Out in Cashbook.','به‌عنوان پول رفت در روزنامچه ثبت شد.')})
    } catch (error) {
      const invalid = /INVALID_AMOUNT|INVALID_DATE|ACCESS_DENIED/.test(error.message)
      setMessage({error:true,text:error.message?.includes('INVALID_EXPENSE_CATEGORY')
        ? t('Enter a category name, up to 80 characters.','نام نوع مصرف را تا ۸۰ حرف وارد کنید.')
        : invalid ? t('Check the amount, date and account.','مبلغ، تاریخ و حساب را بررسی کنید.')
        : t('Could not confirm the save. Retry with the same details.','ثبت تأیید نشد. با همان معلومات دوباره کوشش کنید.')})
    } finally {
      setBusy(false)
    }
  }

  return <>
    {editing && <form className="company-expense-form" onSubmit={save} aria-labelledby="expense-form-title">
      <h2 id="expense-form-title"><span className="company-group-icon"><Plus size={17} aria-hidden="true"/></span>
        {bill ? t('Pay bill','پرداخت بل') : t('Record expense','ثبت مصرف')}
      </h2>
      <fieldset disabled={busy}>
        {bill ? <p>{bill.description}</p> : <div className="company-fields">
          <label>{t('Category','نوع مصرف')}<select required value={form.category} onChange={e=>change('category',e.target.value)}>
            <option value="">{t('Select','انتخاب کنید')}</option>
            {Object.keys(categories).filter(id=>id!=='shipment' && (id!=='salary'||president)).map(id=><option key={id} value={id}>{t(...categories[id])}</option>)}
            <option value="custom">{t('Custom category','نوع مصرف دلخواه')}</option>
          </select></label>
          {president && <label>{t('Paying account','حساب پرداخت')}<select value={account} onChange={e=>change('account',e.target.value)}>
            <option value="admin">{branchName(null)}</option>{branchOptions}
          </select></label>}
        </div>}
        {!bill && custom && <label className="company-custom-category">{t('Category name','نام نوع مصرف')}<input required maxLength={80} value={form.customCategory}
          onChange={e=>change('customCategory',e.target.value)}/></label>}
        {form.category==='salary' && !bill
          ? <RecordLink className="registry-primary" href={recordLink('employees',{payroll:1})} returnTo={returnTo}>{t('Record salary in payroll','ثبت معاش در معاش ماهانه')}</RecordLink>
          : <>
            <div className="company-fields company-amount-fields">
              <div className="company-field">{t('Date','تاریخ')}<SolarHijriDateInput required ariaLabel={t('Expense date','تاریخ مصرف')}
                min={bill?.recorded_on} max={today} language={language} value={form.date} onChange={value=>change('date',value)}/></div>
              <label>{t('Amount','مبلغ')}<input required type="number" dir="ltr" inputMode="decimal" min="0.01" step="0.01"
                max={bill ? bill.remaining : '999999999999.99'} value={form.amount} onChange={e=>change('amount',e.target.value)}/></label>
              <label>{t('Currency','واحد پول')}<select disabled={!!bill} value={form.currency} onChange={e=>change('currency',e.target.value)}>{currencies.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
            </div>
            {!bill && <label>{t('Details','تفصیلات')}<input required maxLength={500} value={form.description}
              onChange={e=>change('description',e.target.value)}/></label>}
            <button className="registry-primary" disabled={(!president && !branchId) || (president && branches===null)}>
              <ArrowUpRight size={16} aria-hidden="true"/>
              {busy ? t('Saving…','در حال ثبت…') : t('Save Money Out','ثبت پول رفت')}
            </button>
            {bill && <button className="registry-secondary" type="button" onClick={()=>{setEditing(false);setBill(null)}}>{t('Cancel','انصراف')}</button>}
          </>}
      </fieldset>
    </form>}
    {message && <p className="company-message" role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    {legacyBills ? data && <section className="company-history">
      {bills.length===0 && <p>{t('No outstanding bills.','بل پرداخت‌نشده وجود ندارد.')}</p>}
      {bills.map(row=><div className="company-record" key={row.id}>
        <span><strong>{row.description}</strong><small>{branchName(row.branch_id)} · {formatSolarHijri(row.due_on)}</small></span>
        <bdi dir="ltr">{money(row.remaining)} {row.currency}</bdi>
        <button className="registry-secondary" disabled={busy} onClick={()=>{
          setBill(row);setForm({date:today,currency:row.currency,amount:row.remaining});setEditing(true);window.scrollTo(0,0)
        }}>{t('Pay','پرداخت')}</button>
      </div>)}
    </section> : <section className="company-history">
      <header><h2><Receipt size={17} aria-hidden="true"/>{t('Expense history','تاریخچه مصارف')}</h2>
        {!editing && <button className="registry-primary" onClick={()=>setEditing(true)}><Plus size={16}/>{t('Record expense','ثبت مصرف')}</button>}
      </header>
      {data && rows.length===0 && <p>{t('No expenses for this selection.','مصرفی در این انتخاب ثبت نشده است.')}</p>}
      {rows.slice(0,limit).map(row=><ExpenseHistoryRow key={row.id} {...{row,t,branchName,returnTo}}/>)}
      {rows.length>limit && <button className="registry-secondary company-more" onClick={()=>setLimit(n=>n+20)}>{t('See more','مشاهده بیشتر')}</button>}
    </section>}
  </>
}
