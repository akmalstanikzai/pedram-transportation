import { useState } from 'react'
import { CircleHelp, Globe, MessageCircle } from 'lucide-react'
import { Modal } from './RecordTools'
import { developerBrand } from '../lib/developerBrand'
import './AboutSupport.css'

export default function AboutSupport({ language, credit = false }) {
  const [open, setOpen] = useState(false)
  const t = (en, fa) => language === 'fa' ? fa : en
  const title = t('About & Support', 'درباره و پشتیبانی')
  const { name, domain, whatsapp } = developerBrand

  return <>
    {credit ? <button type="button" className="developer-credit" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      {t('Developed by', 'توسعه توسط')} <bdi>{name}</bdi>
    </button> : <button type="button" className="record-icon-button about-support-trigger" title={title} aria-label={title}
      aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <CircleHelp size={18} aria-hidden="true" />
    </button>}
    {open && <Modal title={title} className="about-support-modal" onClose={() => setOpen(false)}>
      <div className="record-modal-body about-support-body">
        <div className="developer-profile">
          <img src={`${import.meta.env.BASE_URL}rayan-tech-logo.png`} width="48" height="48" alt="" />
          <div><span>{t('Developed by', 'توسعه توسط')}</span><strong><bdi>{name}</bdi></strong></div>
        </div>
        <a className="about-support-link" href={`https://${domain}/`} target="_blank" rel="noreferrer">
          <Globe size={18} aria-hidden="true" />
          <span>{t('Company website', 'وب‌سایت شرکت')}<bdi dir="ltr">{domain}</bdi></span>
        </a>
        <a className="about-support-link about-support-contact" href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
          <MessageCircle size={18} aria-hidden="true" />
          <span>{t('Technical support on WhatsApp', 'پشتیبانی تخنیکی از طریق واتس‌اپ')}<bdi dir="ltr">{whatsapp}</bdi></span>
        </a>
        <p>{t('For booking, shipment, or payment questions, contact Pedram Transportation.', 'برای سوالات مربوط به بار نامه، محموله یا پرداخت، با شرکت ترانسپورتی پدرام تماس بگیرید.')}</p>
      </div>
    </Modal>}
  </>
}
