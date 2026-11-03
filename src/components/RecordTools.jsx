import { useEffect, useRef } from 'react'
import { Archive, Eye, FileText, KeyRound, Pencil, RotateCcw, X } from 'lucide-react'

export function IconButton({icon:Icon,label,onClick,disabled=false}){return <button type="button" className="record-icon-button" title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon size={19}/></button>}
export function RecordTools({language,archived,onView,onEdit,onArchive,onDocuments,onAccount,disabled}){
 const t=(en,fa)=>language==='fa'?fa:en
 return <div className="record-tools">{onView&&<IconButton icon={Eye} label={t('Details','جزئیات')} onClick={onView} disabled={disabled}/>} {onEdit&&!archived&&<IconButton icon={Pencil} label={t('Edit','ویرایش')} onClick={onEdit} disabled={disabled}/>} {onDocuments&&<IconButton icon={FileText} label={t('Documents','اسناد')} onClick={onDocuments} disabled={disabled}/>} {onAccount&&!archived&&<IconButton icon={KeyRound} label={t('Login account','حساب ورود')} onClick={onAccount} disabled={disabled}/>} {onArchive&&<IconButton icon={archived?RotateCcw:Archive} label={archived?t('Restore','بازیابی'):t('Delete / archive','حذف / بایگانی')} onClick={onArchive} disabled={disabled}/>}</div>
}
export function Modal({title,children,onClose,busy=false,className=''}){
 const ref=useRef(null)
 useEffect(()=>{const previous=document.activeElement;const root=ref.current;root?.focus();return()=>previous?.focus?.()},[])
 function keys(e){if(e.key==='Escape'&&!busy)onClose();if(e.key==='Tab'){const items=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')];if(!items.length){e.preventDefault();return}const first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){e.preventDefault();first.focus()}}}
 return <div className="registry-modal"><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`registry-form-card record-modal ${className}`} onKeyDown={keys}><div className="registry-form-head"><h2>{title}</h2><IconButton icon={X} label="Close / بستن" onClick={onClose} disabled={busy}/></div>{children}</div></div>
}
export function ConfirmArchive({language,onClose,onConfirm,busy,restore=false,error}){
 const t=(en,fa)=>language==='fa'?fa:en
 return <Modal title={restore?t('Restore record','بازیابی معلومات'):t('Delete / archive record','حذف / بایگانی معلومات')} onClose={onClose} busy={busy}><div className="record-modal-body"><p>{restore?t('Restore this record?','این معلومات بازیابی شود؟'):t('Move this record to the archive? It can be restored. Linked history stays available.','این معلومات بایگانی شود؟ قابل بازیابی است و تاریخچه باقی می‌ماند.')}</p>{error&&<p role="alert" className="registry-notice error">{error}</p>}<div className="registry-form-actions"><button type="button" disabled={busy} onClick={onClose}>{t('Cancel','انصراف')}</button><button type="button" className="registry-primary" disabled={busy} onClick={onConfirm}>{restore?t('Restore','بازیابی'):t('Archive','بایگانی')}</button></div></div></Modal>
}
