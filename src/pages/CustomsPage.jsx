import { Stamp } from 'lucide-react'
import { getTranslation } from '../lib/i18n'

export default function CustomsPage({ language }) {
  const text = getTranslation(language)

  return <section className="registry-page customs-page" aria-labelledby="customs-title">
    <div className="booking-page-header customs-page-heading">
      <span className="module-card-icon cyan"><Stamp size={30} strokeWidth={1.8} aria-hidden="true" /></span>
      <div>
        <h1 id="customs-title">{text.customs}</h1>
        <p>{text.customsDescription}</p>
      </div>
    </div>
    <div className="empty-state customs-empty-state">
      <span className="empty-state-mark"><Stamp size={27} strokeWidth={1.8} aria-hidden="true" /></span>
      <h2>{text.customsEmpty}</h2>
    </div>
  </section>
}
