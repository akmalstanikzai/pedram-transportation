import { useRef, useState } from 'react'
import OwnerRegistrationFields from './OwnerRegistrationFields'
import { ownerFormFromRow } from '../lib/ownerForm'
import { persistVehicleOwner } from '../lib/vehicleOwnerCreation'
import { rpc, explain } from '../lib/operations'
import { uploadFleetPhoto, uploadOwnerIdentity } from '../lib/fleetPhotos'

export default function VehicleOwnerForm({ language, branchId, onCreated, onCancel, onDone, onBusyChange }) {
  const t = (en,fa) => language === 'fa' ? fa : en
  const [form,setForm] = useState(() => ownerFormFromRow(null,branchId))
  const [files,setFiles] = useState({})
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [savedOwner,setSavedOwner] = useState(null)
  const progress = useRef({ saved: null, completed: new Set(), request: null })
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); onBusyChange(true); setError('')
    try {
      await persistVehicleOwner(progress.current, {
        form, files, saveOwner: args => rpc('save_owner_record',args),
        uploadPhoto: (id,file) => uploadFleetPhoto('owner',id,file), uploadIdentity: uploadOwnerIdentity,
        onCreated: owner => { setSavedOwner(owner); onCreated(owner) },
      })
      onDone()
    } catch (failure) { setError(explain(failure,language)) }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <form className="registry-form owner-registration-form" onSubmit={submit}>
    <fieldset className="booking-fields wide" disabled={busy || !!savedOwner}>
      <OwnerRegistrationFields language={language} form={form} onChange={setForm} files={files} onFilesChange={setFiles}/>
    </fieldset>
    {error && <p className="wide registry-notice error" role="alert">{error}</p>}
    <div className="registry-form-actions">
      <button type="button" disabled={busy} onClick={onCancel}>{t('Back to vehicle','بازگشت به واسطه')}</button>
      <button className="registry-primary" disabled={busy}>{savedOwner ? t('Finish uploads','تکمیل آپلودها') : t('Save owner and select','ثبت و انتخاب مالک')}</button>
    </div>
  </form>
}
