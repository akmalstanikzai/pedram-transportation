import { useState } from 'react'
import Icon from './Icon'

export default function Field({ label, type = 'text', value, onChange, placeholder, icon, showLabel = 'Show password', hideLabel = 'Hide password' }) {
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'

  return <label className="field">{label && <span className="field-label">{label}</span>}<span className="input-wrap"><Icon name={icon} size={18} /><input type={isPassword && visible ? 'text' : type} value={value} onChange={onChange} placeholder={placeholder} aria-label={label || placeholder} autoComplete={isPassword ? 'current-password' : 'email'} required />{isPassword && <button type="button" className="visibility" onClick={() => setVisible(!visible)} aria-label={visible ? hideLabel : showLabel}><Icon name={visible ? 'eyeOff' : 'eye'} size={18} /></button>}</span></label>
}
