import { useEffect, useRef, useState } from 'react'
import { allRows, cents, currencies, kabulToday } from '../lib/cashbook'
import { formatSolarHijri, solarHijriToISODate, solarHijriToday } from '../lib/solarHijri'
import { rpc } from '../lib/operations'
import { supabase } from '../lib/supabase'
import SolarHijriDateInput from '../components/SolarHijriDateInput'
import './CompanyPages.css'

const categories = {
  food: ['Food', 'خوراک'], electricity: ['Electricity', 'بل برق'], rent: ['Office rent', 'کرایه دفتر'],
  fuel: ['Fuel', 'تیل'], maintenance: ['Maintenance', 'ترمیم و نگهداری'], internet: ['Internet and phone', 'انترنت و تلفن'],
  supplies: ['Office supplies', 'لوازم دفتر'], other: ['Other', 'سایر'], salary: ['Salary', 'معاش'],
  shipment: ['Shipment costs', 'مصارف محموله'],
}
const money = value => Number(value).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})
const emptyForm = () => ({date:kabulToday(),category:'food',currency:'AFN',amount:'',description:'',due:''})

export default function CompanyPages({ kind, language, profile, onBack }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const president = profile.role === 'president'
  const expenses = kind === 'expenses'
  const [scope,setScope] = useState(()=>president
    ? new URLSearchParams(globalThis.window?.location?.hash.split('?')[1]).get('account') || 'all'
    : profile.branch_id)
  const [branches,setBranches] = useState([])
  const [period,setPeriod] = useState('month')
  const [tab,setTab] = useState('money')
  const [filter,setFilter] = useState('')
  const [limit,setLimit] = useState(20)
  const [result,setResult] = useState(null)
  const [revision,refresh] = useState(0)
  const [form,setForm] = useState(emptyForm)
  const [formMode,setFormMode] = useState(null)
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState(null)
  const billsRef = useRef(null)
  const pending = useRef(null)
  const today = kabulToday()
  const {year,month} = solarHijriToday()
  const start = period === 'today' ? today : period === 'all' ? '0001-01-01' : solarHijriToISODate(year,month,1)
  const branchId = !scope || scope === 'all' || scope === 'admin' ? null : scope
  const all = scope === 'all'
  const key = JSON.stringify([kind,scope,start,today,revision])

  useEffect(() => {
    let active = true
    if (president) allRows(supabase,'branches','id,name,archived_at').then(rows=>{
      if (active) setBranches(rows)
    }).catch(()=>{if(active)setBranches(null)})
    return () => { active = false }
  }, [president])

  useEffect(() => {
    let active = true
    const args = {p_all:all,p_branch:branchId,p_start:start}
    rpc(expenses ? 'company_expenses' : 'company_overview', expenses ? {...args,p_end:today} : args)
      .then(data=>{if(active)setResult({key,data})})
      .catch(error=>{if(active)setResult({key,error})})
    return () => {active = false}
  }, [all,branchId,expenses,key,start,today])

  const change = (name,value) => setForm(current=>({...current,[name]:value}))
  const branchName = id => branches?.find(row=>row.id===id)?.name ?? (id ? t('Branch','شعبه') : t('Head office','دفتر مرکزی'))
  const branchOptions = branches?.filter(row=>!row.archived_at).map(row=><option key={row.id} value={row.id}>{row.name}</option>)
  const data = result?.key === key ? result.data : null
  const rows = (data?.payments ?? []).filter(row=>!filter || row.category===filter)
  const categoryName = id => t(...categories[id])
  const showError = result?.key===key && result.error

  useEffect(()=>{
    if (data && expenses && new URLSearchParams(window.location.hash.split('?')[1]).has('bills')) {
      billsRef.current?.scrollIntoView({block:'start'})
    }
  },[data,expenses])

  async function submit(event) {
    event.preventDefault()
    if (busy || (!president && !profile.branch_id)) return
    const bill = typeof formMode === 'object' ? formMode : null
    const args = bill ? {p_bill:bill.id,p_date:form.date,p_amount:form.amount} : {
      p_branch:president ? (form.account === 'admin' ? null : form.account) : profile.branch_id,
      p_category:form.category,p_currency:form.currency,p_description:form.description.trim(),
      p_date:form.date,p_amount:form.amount,p_due:formMode==='bill' ? form.due : null,
    }
    if (!form.date || (formMode==='bill' && !form.due)) {
      setMessage({error:true,text:t('Enter the required dates.','تاریخ‌های لازم را وارد کنید.')})
      return
    }
    const signature = JSON.stringify(args)
    if (pending.current?.signature!==signature) pending.current = {signature,id:crypto.randomUUID()}
    setBusy(true)
    setMessage(null)
    try {
      await rpc(bill ? 'pay_office_bill' : 'save_office_expense',{p_request:pending.current.id,...args})
      pending.current = null
      setFormMode(null)
      refresh(value=>value+1)
      window.dispatchEvent(new Event('pedram:cashbook-changed'))
      setMessage({text:formMode==='bill' ? t('Bill saved.','بل ثبت شد.') : t('Payment saved in Cashbook.','پرداخت در روزنامچه ثبت شد.')})
    } catch (error) {
      const invalid = ['INVALID_AMOUNT','INVALID_DATE','ACCESS_DENIED'].some(code=>error.message?.includes(code))
      setMessage({error:true,text:invalid ? t('Check the amount, dates, and paying account.','مبلغ، تاریخ و حساب پرداخت را بررسی کنید.') :
        t('Could not confirm the save. Retry with the same details.','ثبت تأیید نشد. با همان معلومات دوباره کوشش کنید.')})
    } finally {
      setBusy(false)
    }
  }

  function openForm(mode) {
    const bill = typeof mode === 'object' ? mode : null
    setMessage(null)
    setForm({...emptyForm(),account:all ? 'admin' : scope,...(bill ? {currency:bill.currency,amount:bill.remaining} : {})})
    setFormMode(mode)
  }

  const metrics = [
    ['cash','Cash balance','بیلانس','cashbook'],['incoming','Money in','آمد','cashbook'],['outgoing','Money out','رفت','cashbook'],
    ['trader','Traders owe','طلب از تاجران','traders'],['driver','Driver commissions due','کمیسیون رانندگان','vehicles?drivers=1'],
    ['customs','Customs fees due','بدهی کمیشن‌کاران','customs'],['payroll','Remaining payroll','معاش باقی‌مانده','employees?payroll=1'],
    ['bills','Unpaid bills','بل‌های پرداخت‌نشده','expenses?bills=1'],['expenses','Expenses paid','مصارف پرداخت‌شده','expenses'],
  ]
  const counts = [
    ['waiting','Waiting to start','منتظر حرکت','bookings?status=confirmed'],
    ['road','On the road','در راه','bookings?status=in_transit'],
    ['delivery','Deliveries awaiting confirmation','تحویل‌های منتظر تأیید','bookings?attention=deliveries'],
    ['drivers','Active drivers','رانندگان فعال','vehicles?drivers=1'],
    ['availableDrivers','Drivers available today','رانندگان آماده امروز','availability?drivers=1'],
    ['availableVehicles','Vehicles available today','وسایط آماده امروز','availability'],
    ['branches','Active branches','شعبه‌های فعال',president ? 'branches' : null],
  ]
  const bookingLink = link => link.startsWith('bookings?') && !all
    ? `${link}&scope=${scope==='admin' ? 'head-office' : scope}` : link
  const moneyLink = link => {
    if (all || !president || !/^(cashbook$|expenses\b)/.test(link)) return link
    return `${link}${link.includes('?')?'&':'?'}account=${scope}`
  }
  const groups = [
    ['Cashbook','روزنامچه',['cash','incoming','outgoing']],
    ['Owed to Pedram','طلب شرکت',['trader','driver']],
    ['Recorded amounts owed by Pedram','بدهی ثبت‌شده شرکت',['customs','payroll','bills']],
    ['Expenses','مصارف',['expenses']],
  ]

  return <section className="registry-page company-page">
    <header className="company-header">
      <div><button className="module-back" onClick={onBack}>{t('Back','بازگشت')}</button>
        <h1>{expenses ? t('Expenses','مصارف') : t('Company overview','خلاصه شرکت')}</h1></div>
      {expenses && <div className="company-controls">
        <button className="registry-primary" onClick={()=>openForm('paid')} disabled={busy}>{t('Record expense','ثبت مصرف')}</button>
        <button className="registry-secondary" onClick={()=>openForm('bill')} disabled={busy}>{t('Add unpaid bill','ثبت بل پرداخت‌نشده')}</button>
      </div>}
    </header>
    <div className="company-controls company-filters">
      {president && <label>{t('Account','حساب')}<select value={scope} onChange={e=>{setScope(e.target.value);setLimit(20)}}>
        <option value="all">{t('All branches','همه شعبه‌ها')}</option><option value="admin">{branchName(null)}</option>{branchOptions}
      </select></label>}
      {(expenses || tab==='money') && <label>{t('Period','دوره')}<select value={period} onChange={e=>{setPeriod(e.target.value);setLimit(20)}}>
        <option value="today">{t('Today','امروز')}</option><option value="month">{t('This month','این ماه')}</option><option value="all">{t('All dates','همه تاریخ‌ها')}</option>
      </select></label>}
      {expenses && <label>{t('Category','نوع مصرف')}<select value={filter} onChange={e=>{setFilter(e.target.value);setLimit(20)}}>
        <option value="">{t('All categories','همه انواع')}</option>{Object.keys(categories).filter(id=>id!=='salary'||president).map(id=><option key={id} value={id}>{categoryName(id)}</option>)}
      </select></label>}
    </div>
    {branches===null && <p role="alert">{t('Could not load branches.','شعبه‌ها بارگیری نشد.')}</p>}
    {showError && <p role="alert">{t('Could not load records.','ریکاردها بارگیری نشد.')} <button onClick={()=>refresh(value=>value+1)}>{t('Retry','تلاش دوباره')}</button></p>}
    {!data && !showError && <p role="status">{t('Loading…','در حال بارگیری…')}</p>}
    {message && <p className="company-message" role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    {!expenses && <>
      <div className="company-controls company-tabs">
        <button aria-pressed={tab==='money'} onClick={()=>setTab('money')}>{t('Money','مالی')}</button>
        <button aria-pressed={tab==='operations'} onClick={()=>setTab('operations')}>{t('Operations','عملیات')}</button>
      </div>
      {data && (tab==='operations' ? <div className="company-grid">
        {counts.map(([id,en,fa,link])=><article key={id} className="company-card">
          {link ? <a href={`#/${bookingLink(link)}`}>{t(en,fa)}</a> : <span>{t(en,fa)}</span>}
          <strong>{data.operations[id]}</strong>
        </article>)}
      </div> : <>
        <p className="company-date">{t('Balances as of','بیلانس تا')} <bdi>{formatSolarHijri(today)}</bdi></p>
        {groups.map(([enGroup,faGroup,ids])=>{
          const cards = metrics.filter(([id])=>ids.includes(id) && data.money.some(row=>row[id]!=null))
          if (!cards.length) return null
          const showTotal = ids.includes('trader') || ids.includes('bills')
          const totals = showTotal ? data.money.map(row=>({
            currency:row.currency,
            amount:ids.reduce((sum,id)=>sum+cents(row[id]),0),
          })).filter(row=>row.amount || row.currency==='AFN') : []
          return <section className="company-metrics" key={enGroup}><h2>{t(enGroup,faGroup)}</h2>
          {showTotal && <div className="company-controls company-group-totals">
            {totals.map(row=><bdi key={row.currency}>{money(row.amount/100)} {row.currency}</bdi>)}
          </div>}
          <div className="company-grid">{cards.map(([id,en,fa,link])=><article key={id} className="company-card" data-metric={id}>
          <a href={`#/${moneyLink(link)}`}>{t(en,fa)}</a>
          {data.money.filter(row=>row[id]!=null && (row.currency==='AFN' || Number(row[id])!==0)).map(row=><div className="company-amount" key={row.currency}><span>{row.currency}</span><strong><bdi>{money(row[id])}</bdi></strong></div>)}
        </article>)}</div></section>})}
      </>)}
    </>}
    {expenses && <>
      {formMode && <form className="company-panel company-form" onSubmit={submit}>
        <h2>{typeof formMode==='object' ? t('Pay bill','پرداخت بل') : formMode==='bill' ? t('Add unpaid bill','ثبت بل پرداخت‌نشده') : t('Record expense','ثبت مصرف')}</h2>
        <fieldset disabled={busy}>
          <div className="company-fields">
            {typeof formMode!=='object' && <>
              {president && <label>{t('Paying account','حساب پرداخت')}<select value={form.account} onChange={e=>change('account',e.target.value)}>
                <option value="admin">{branchName(null)}</option>{branchOptions}
              </select></label>}
              <label>{t('Category','نوع مصرف')}<select value={form.category} onChange={e=>change('category',e.target.value)}>
                {Object.keys(categories).filter(id=>id!=='shipment' && (id!=='salary'||(president&&formMode==='paid'))).map(id=><option key={id} value={id}>{categoryName(id)}</option>)}
              </select></label>
            </>}
          </div>
          {form.category==='salary' ? <a className="registry-primary" href="#/employees?payroll=1">{t('Open monthly payroll','باز کردن معاش ماهانه')}</a> : <>
            <div className="company-fields">
              <div>{t('Date','تاریخ')}<SolarHijriDateInput value={form.date} onChange={value=>change('date',value)} language={language}/></div>
              <label>{t('Amount','مبلغ')}<input required type="number" inputMode="decimal" min="0.01" step="0.01" max={typeof formMode==='object' ? formMode.remaining : '999999999999.99'} value={form.amount} onChange={e=>change('amount',e.target.value)}/></label>
              <label>{t('Currency','واحد پول')}<select disabled={typeof formMode==='object'} value={form.currency} onChange={e=>change('currency',e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
            </div>
            {formMode==='bill' && <div>{t('Due date','تاریخ سررسید')}<SolarHijriDateInput value={form.due} onChange={value=>change('due',value)} language={language}/></div>}
            {typeof formMode==='object' ? <p>{formMode.description}</p> : <label>{t('Details','تفصیلات')}<input required maxLength={500} value={form.description} onChange={e=>change('description',e.target.value)}/></label>}
            <button className="registry-primary">{t('Save','ثبت')}</button>
          </>}
          <button type="button" className="registry-secondary" onClick={()=>setFormMode(null)}>{t('Cancel','انصراف')}</button>
        </fieldset>
      </form>}
      {data && <>
        <section className="company-panel company-bills" ref={billsRef}>
          <h2>{t('Bills due','بل‌های پرداخت‌نشده')}</h2>
          {data.bills.length===0 && <p>{t('No unpaid bills.','بل پرداخت‌نشده وجود ندارد.')}</p>}
          {data.bills.map(bill=><article className="company-row" key={bill.id}>
            <div><strong>{bill.description}</strong><small>{categoryName(bill.category)} · {branchName(bill.branch_id)} · <bdi>{formatSolarHijri(bill.due_on)}</bdi></small></div>
            <div><bdi>{money(bill.remaining)} {bill.currency}</bdi> <button className="registry-secondary" disabled={busy} onClick={()=>{openForm(bill);window.scrollTo(0,0)}}>{t('Pay','پرداخت')}</button></div>
          </article>)}
        </section>
        <section className="company-panel">
          <h2>{t('Cashbook payments','پرداخت‌های روزنامچه')}</h2>
          <div className="company-controls">
            {['office','shipment'].map(group=>{
              const entries=rows.filter(row=>group==='shipment' ? row.category==='shipment' : row.category!=='shipment')
              return <div className="company-total" key={group}><strong>{group==='office' ? t('Operating expenses','مصارف اداری') : categoryName('shipment')}</strong>
                {currencies.filter(c=>entries.some(row=>row.currency===c)).map(c=><bdi key={c}>{money(entries.filter(row=>row.currency===c).reduce((sum,row)=>sum+(row.direction==='out'?1:-1)*cents(row.amount),0)/100)} {c}</bdi>)}
              </div>
            })}
          </div>
          {rows.length===0 && <p>{t('No payments for this selection.','پرداختی در این انتخاب وجود ندارد.')}</p>}
          {rows.slice(0,limit).map(row=><article className="company-row" key={row.id}>
            <div><strong>{categoryName(row.category)}</strong><small>{row.description}</small>
              <small><bdi>{formatSolarHijri(row.entry_date)}</bdi> · {branchName(row.branch_id)}</small></div>
            <div><bdi>{row.direction==='in'?'−':''}{money(row.amount)} {row.currency}</bdi>
              <small><a href={`#/cashbook?receipt=${row.receipt_number}&account=${row.branch_id||'admin'}&currency=${row.currency}&date=${row.entry_date}`}>{t('Receipt','رسید')} #{row.receipt_number}</a></small></div>
          </article>)}
          {rows.length>limit && <button className="registry-secondary" onClick={()=>setLimit(n=>n+20)}>{t('See more','مشاهده بیشتر')}</button>}
        </section>
      </>}
    </>}
  </section>
}
