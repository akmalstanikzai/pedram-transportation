import { ArrowLeftRight, ClipboardList, MapPin, PackageCheck, Printer, ReceiptText, Send, UserRound, Wallet } from 'lucide-react'
import { InformationGroup } from './FleetInformation'
import { formatSolarHijri, kabulISODate } from '../lib/solarHijri'
import { bookingDue } from '../lib/bookingFinance'
import ManagedBookingStatement from './ManagedBookingStatement'

const hasValue = value => value !== null && value !== undefined && String(value).trim() !== ''

export default function BookingInformation({ row, language, president = false, vehicle, driver, branch, onPrint, onPayExpense, message }) {
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
      <button type="button" className="registry-secondary" onClick={onPrint}><Printer size={17} aria-hidden="true" />{t('Print confirmation','چاپ تأییدیه')}</button>
    </div>
    {message && <p className="registry-notice error" role="alert">{message}</p>}
    <div className="booking-information-overview">
      <InformationGroup tone="blue" icon={ClipboardList} title={t('Booking information','معلومات بار نامه')} fields={[
        field('date','Booking date','تاریخ ثبت',formatSolarHijri(row.booking_date),numeric),
        field('status','Status','وضعیت',status && <span className={`status-pill ${row.status}`}>{status}</span>),
        ...(row.managed_transport ? [] : [
          field('departure','Departure date','تاریخ حرکت',formatSolarHijri(row.departure_date || row.booking_date),numeric),
          field('arrival','Arrival date','تاریخ رسیدن',formatSolarHijri(row.arrival_date || row.departure_date || row.booking_date),numeric),
        ]),
        field('service','Service','خدمات',managed ? t('Company-managed transport','انتقال توسط شرکت (خارجی)') : t('Vehicle arrangement','معرفی واسطه')),
        field('branch','Office','دفتر',branch?.name || (!row.branch_id ? t('Head office','دفتر مرکزی') : '—')),
      ]}/>
      <InformationGroup tone="teal" icon={MapPin} title={t('Route and cargo','مسیر و بار')} fields={[
        field('origin','Origin','مبدأ',row.origin),
        field('destination','Destination','مقصد',row.destination),
        field('border','Border handover','محل تحویل در مرز',row.managed_transport?.border_location,optional),
        field('goods','Goods','بار',row.goods),
        field('quantity','Goods amount','مقدار بار',quantity),
        field('vehicle',row.handoff_date ? 'First vehicle' : 'Vehicle',row.handoff_date ? 'واسطهٔ اول' : 'واسطه',vehicle?.plate_number || row.vehicles?.plate_number),
        field('driver',row.handoff_date ? 'First driver' : 'Driver',row.handoff_date ? 'رانندهٔ اول' : 'راننده',driver?.full_name || row.drivers?.full_name),
        field('waybill','Afghan waybill number','نمبر بارنامهٔ موتر افغانی',row.managed_transport?.afghan_waybill,optional),
      ]}/>
    </div>
    {row.handoff_date && <InformationGroup tone="purple" icon={ArrowLeftRight} title={t('Truck handoff','انتقال بار به واسطهٔ دوم')} fields={[
      field('location','Transfer location','محل انتقال',row.handoff_location),
      field('planned','Transfer date','تاریخ انتقال',formatSolarHijri(row.handoff_date),numeric),
      field('vehicle','Second vehicle','واسطهٔ دوم',row.onward_vehicle?.plate_number),
      field('driver','Second driver','رانندهٔ دوم',row.onward_driver?.full_name),
      field('state','Transfer status','وضعیت انتقال',row.handoff_confirmed_at ? t('Confirmed','تأیید شد') : t('Planned','برنامه‌ریزی‌شده')),
      field('confirmed','Confirmed on','تاریخ تأیید',row.handoff_confirmed_at ? formatSolarHijri(kabulISODate(new Date(row.handoff_confirmed_at))) : null,{ ...numeric,...optional }),
    ]}/>}
    <div className="booking-information-contacts">
      <InformationGroup tone="purple" icon={UserRound} title={t('Trader','تاجر')} fields={[
        field('name','Name','نام',traderName),
        field('phone','Mobile','موبایل',row.trader_phone || row.traders?.phone,numeric),
        field('address','Address','آدرس',row.trader_address,{ wide:true }),
      ]}/>
      {(managed || [row.sender_name,row.sender_phone,row.sender_address].some(hasValue)) && <InformationGroup tone="rose" icon={Send} title={t('Sender','فرستنده')} fields={[
        field('name','Name','نام',row.sender_name),
        field('phone','Mobile','موبایل',row.sender_phone,numeric),
        field('address','Address','آدرس',row.sender_address,{ wide:true }),
      ]}/>}
      {(managed || [row.receiver_name,row.receiver_phone,row.receiver_address].some(hasValue)) && <InformationGroup tone="cyan" icon={PackageCheck} title={t('Receiver','گیرنده')} fields={[
        field('name','Name','نام',row.receiver_name),
        field('phone','Mobile','موبایل',row.receiver_phone,numeric),
        field('address','Address','آدرس',row.receiver_address,{ wide:true }),
      ]}/>}
    </div>
    {row.managed_transport ? <>
      <InformationGroup tone="blue" title={t('Foreign vehicle details','مشخصات موتر خارجی')} fields={[
        field('plate','Plate number','نمبر پلیت',row.managed_transport.foreign_plate),
        field('driver','Driver name','نام راننده',row.managed_transport.foreign_driver),
        field('mobile','Mobile','موبایل',row.managed_transport.foreign_mobile,numeric),
      ]}/>
      <ManagedBookingStatement data={row.managed_transport} language={language} onPayExpense={onPayExpense}/>
    </> : <div className="booking-information-overview">
      <InformationGroup tone="amber" icon={ReceiptText} title={t('Charges','بدهی‌ها')} fields={[
        field('commission','Commission','کمیسیون',money(row.commission_amount),numeric),
        ...(row.commission_driver_id ? [field('payer','Commission payer','پرداخت‌کنندهٔ کمیسیون',driver?.full_name || t('Driver','راننده'))] : []),
        field('freight','Freight','کرایه بار',hasValue(row.freight_amount) ? money(row.freight_amount) : null,{ ...numeric,...optional }),
        field('vehicle-cost','Vehicle / driver cost','مصارف واسطه و راننده',hasValue(row.carrier_cost) ? money(row.carrier_cost) : null,{ ...numeric,...optional }),
        field('expenses','Other expenses','مصارف دیگر',expenses.length ? <ul className="booking-information-expenses">{expenses.map((expense,index) => <li key={index}><span>{expense.description}</span><bdi dir="ltr">{money(expense.amount)}</bdi></li>)}</ul> : null,{ ...optional,wide:true }),
      ]}/>
      {president && <InformationGroup tone="sage" icon={Wallet} title={t('Payment summary','خلاصه پرداخت')} fields={[
        field('total','Total owed','مجموع بدهی',money(row.charged),numeric),
        field('paid','Paid','پرداخت‌شده',money(row.paid),numeric),
        field('remaining','Remaining owed','باقی‌مانده قابل پرداخت',hasValue(row.charged) && hasValue(row.paid) ? money(bookingDue(row.charged,row.paid)/100) : '—',{ ...numeric,wide:true }),
      ]}/>}
    </div>}
  </div>
}
