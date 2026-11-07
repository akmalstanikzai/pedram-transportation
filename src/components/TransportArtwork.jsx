import { Globe2, MapPin } from 'lucide-react'

export default function TransportArtwork() {
  return <div className="auth-transport-art" aria-hidden="true">
    <div className="auth-photo auth-photo-terminal"><img src="/login-freight-terminal.jpg" alt="" /></div>
    <svg className="auth-route-map" viewBox="0 0 720 900" fill="none" preserveAspectRatio="xMidYMid slice">
      <g stroke="currentColor" strokeWidth="1">
        <path d="m60 165 37-20 23 7 30-11 29 18 29-4 29 24-9 25-27 7-10 25-21 7-15 38-25 5-8-29-29-17-8-28-30-14Zm95 140 36 10 23 32 3 35 19 29-13 41-17 7-9 41-17-17-5-35-18-30 4-37-17-29Z"/>
        <path d="m310 170 38-13 14 12 30-9 20 18 43-14 22 13 41 1 29 26 51 16 27 36-20 24-49-3-14 28-34 3-20-24-29 3-25-28-23 5-8 25-21-7-4-36-24-11-29 5-28-19-8-28Z"/>
        <path d="m342 297 30-12 35 17 25 31-5 31-28 42-16 49-24-8-6-42-24-22-12-43Zm180 153 33-19 42 10 19 25-20 24-40-1-32-17Z"/>
        <path d="M105 678c-35-92 22-191 111-233s239-53 291-130 7-144-62-158" strokeDasharray="4 9" strokeLinecap="round"/>
        <path d="M145 188c76-63 245-65 321-4s135 141 113 258-98 208-79 290" strokeDasharray="3 10" strokeLinecap="round"/>
      </g>
      <g fill="currentColor"><circle cx="217" cy="445" r="5"/><circle cx="507" cy="315" r="5"/><circle cx="445" cy="157" r="5"/><circle cx="105" cy="678" r="5"/></g>
      <g stroke="currentColor"><circle cx="217" cy="445" r="14"/><circle cx="507" cy="315" r="14"/></g>
    </svg>
    <div className="auth-photo auth-photo-plane"><img src="/login-cargo-plane-sunset.jpg" alt="" /></div>
    <div className="auth-photo auth-photo-truck"><img src="/login-road-freight.jpg" alt="" /></div>
    <span className="auth-map-marker"><MapPin size={21} strokeWidth={1.5} /></span>
    <span className="auth-globe-mark"><Globe2 size={27} strokeWidth={1.2} /></span>
  </div>
}
