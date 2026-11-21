import { InformationGroup } from './FleetInformation'
import { formatSolarHijri } from '../lib/solarHijri'
import { bookingDue } from '../lib/bookingFinance'

const hasValue = value => value !== null && value !== undefined && String(value).trim() !== ''

export default function BookingInformation({ row, language, president = false, vehicle, driver, branch, onPrint, message }) {
  const t = (en,fa) => language === 'fa' ? fa : en
  const field = (key,en,fa,value,options = {}) => ({ key,label:t(en,fa),value,...options })
  const optional = { optional:true }, numeric = { ltr:true }
  const money = value => hasValue(value) ? `${Number(value).toLocaleString('en-US',{ minimumFractionDigits:2, maximumFractionDigits:2 })} ${row.commission_currency || 'AFN'}` : '—'
  const status = { confirmed:t('Confirmed','تأییدشده'), in_transit:t('On road','در راه'), completed:t('Completed','تکمیل‌شده'), cancelled:t('Cancelled','لغوشده') }[row.status] || row.status
  const traderName = [row.trader_first_name,row.trader_last_name].filter(hasValue).join(' ') || row.traders?.full_name
  const quantity = hasValue(row.quantity_amount)
    ? `${row.quantity_amount} ${{ tons:t('tons','تن'), pieces:t('pieces','عدد'), m3:t('m³','متر مکعب') }[row.quantity_unit] || ''}`
    : hasValue(row.weight_tons) ? `${row.weight_tons} ${t('tons','تن')}` : hasValue(row.volume_m3) ? `${row.volume_m3} ${t('m³','متر مکعب')}` : row.quantity
  const expenses = row.other_expenses || []
  const managed = row.service_type === 'managed'
  return <div className="record-modal-body fleet-information-view booking-information-view">
    <div className="booking-information-actions">
      <button type="button" className="registry-secondary" onClick={onPrint}>{t('Print confirmation','چاپ تأییدیه')}</button>
    </div>
    {message && <p role="alert">{message}</p>}
    <InformationGroup title={t('Booking information','معلومات بار نامه')} fields={[
      field('date','Date','تاریخ',formatSolarHijri(row.booking_date),numeric),
      field('status','Status','وضعیت',status),
      field('service','Service','خدمات',managed ? t('Company-managed transport','انتقال توسط شرکت') : t('Vehicle arrangement','معرفی واسطه')),
      field('branch','Office','دفتر',branch?.name || (!row.branch_id ? t('Head office','دفتر مرکزی') : '—')),
    ]}/>
    <InformationGroup title={t('Route and cargo','مسیر و بار')} fields={[
      field('origin','Origin','مبدأ',row.origin),
      field('destination','Destination','مقصد',row.destination),
      field('goods','Goods','بار',row.goods),
      field('quantity','Goods amount','مقدار بار',quantity),
      field('vehicle','Vehicle','واسطه',vehicle?.plate_number || row.vehicles?.plate_number),
      field('driver','Driver','راننده',driver?.full_name || row.drivers?.full_name),
    ]}/>
    <InformationGroup title={t('Trader','تاجر')} fields={[
      field('name','Name','نام',traderName),
      field('phone','Mobile','موبایل',row.trader_phone || row.traders?.phone,numeric),
      field('address','Address','آدرس',row.trader_address,{ wide:true }),
    ]}/>
    {(managed || [row.sender_name,row.sender_phone,row.sender_address].some(hasValue)) && <InformationGroup title={t('Sender','فرستنده')} fields={[
      field('name','Name','نام',row.sender_name),
      field('phone','Mobile','موبایل',row.sender_phone,numeric),
      field('address','Address','آدرس',row.sender_address,{ wide:true }),
    ]}/>}
    {(managed || [row.receiver_name,row.receiver_phone,row.receiver_address].some(hasValue)) && <InformationGroup title={t('Receiver','گیرنده')} fields={[
      field('name','Name','نام',row.receiver_name),
      field('phone','Mobile','موبایل',row.receiver_phone,numeric),
      field('address','Address','آدرس',row.receiver_address,{ wide:true }),
    ]}/>}
    <InformationGroup title={t('Charges','بدهی‌ها')} fields={[
      field('commission','Commission','کمیسیون',money(row.commission_amount),numeric),
      field('freight','Freight','کرایه بار',hasValue(row.freight_amount) ? money(row.freight_amount) : null,{ ...numeric,...optional }),
      field('vehicle-cost','Vehicle / driver cost','مصارف واسطه و راننده',hasValue(row.carrier_cost) ? money(row.carrier_cost) : null,{ ...numeric,...optional }),
      field('expenses','Other expenses','مصارف دیگر',expenses.length ? <ul className="booking-information-expenses">{expenses.map((expense,index) => <li key={index}><span>{expense.description}</span><bdi dir="ltr">{money(expense.amount)}</bdi></li>)}</ul> : null,{ ...optional,wide:true }),
    ]}/>
    {president && <InformationGroup title={t('Payment summary','خلاصه پرداخت')} fields={[
      field('total','Total owed','مجموع بدهی',money(row.charged),numeric),
      field('paid','Paid','پرداخت‌شده',money(row.paid),numeric),
      field('remaining','Remaining owed','باقی‌مانده قابل پرداخت',hasValue(row.charged) && hasValue(row.paid) ? money(bookingDue(row.charged,row.paid)/100) : '—',{ ...numeric,wide:true }),
    ]}/>}
  </div>
}
