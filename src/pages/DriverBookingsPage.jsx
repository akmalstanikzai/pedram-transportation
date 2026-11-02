import { useEffect, useState } from 'react'
import { MapPin, Truck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows } from '../lib/cashbook'
import { bookingColumns, explain } from '../lib/operations'
export default function DriverBookingsPage({language}){
 const t=(en,fa)=>language==='fa'?fa:en
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 useEffect(()=>{let active=true;allRows(supabase,'bookings',bookingColumns).then(data=>{if(active)setRows(data.filter(r=>!r.archived_at))}).catch(e=>{if(active)setError(explain(e,language))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[language])
 const status={confirmed:t('Confirmed','تأییدشده'),in_transit:t('On road','در راه'),completed:t('Completed','تکمیل‌شده'),cancelled:t('Cancelled','لغوشده')}
 return <div><h1 className="role-title"><Truck size={25}/>{t('My bookings','بوکینگ‌های من')}</h1>{error&&<p role="alert" className="registry-notice error">{error}</p>}{loading?<p>{t('Loading…','در حال بارگیری…')}</p>:!rows.length?<p>{t('No bookings assigned.','هنوز بوکینگی تعیین نشده است.')}</p>:<div className="booking-list">{rows.map(r=><article className="booking-record" key={r.id}><h3><MapPin size={20}/>#{r.booking_number} · {r.origin} → {r.destination}</h3><p>{status[r.status]} · {r.departure_date} — {r.arrival_date}</p><p>{r.goods} · {r.weight_tons||'—'} t · {r.volume_m3||'—'} m³</p><p>{t('Sender','فرستنده')}: {r.sender_name} · {r.sender_phone} · {r.sender_address}</p><p>{t('Receiver','گیرنده')}: {r.receiver_name} · {r.receiver_phone} · {r.receiver_address}</p></article>)}</div>}</div>
}
