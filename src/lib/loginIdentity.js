// Shared with the standalone Edge Functions; keep copies identical (tested).
export function normalizeLogin(value) {
  if (typeof value !== 'string') throw new Error('INVALID_LOGIN')
  const login = value.normalize('NFKC').trim()
  const invisibleControl = [...login].some(char => { const code = char.codePointAt(0); return code < 32 || code >= 127 && code <= 159 || code >= 8234 && code <= 8238 || code >= 8294 && code <= 8297 })
  if (!login || [...login].length > 120 || invisibleControl) throw new Error('INVALID_LOGIN')
  return login
}

export async function loginIdentity(value) {
  const login = normalizeLogin(value), key = login.toLowerCase()
  // Preserve existing email sign-ins and the original ASCII username format.
  const [local,domain,...extra] = key.split('@')
  const atom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/i
  const email = !extra.length && local?.length <= 64 && local.split('.').every(part => atom.test(part)) && domain?.includes('.') && domain.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(part))
  if (email) return {login, email:key, username:null}
  if (key.length <= 64 && /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(key)) return {login, email:`${key}@users.pedram.local`, username:login}
  // Names, spaces and symbols are encoded into an email accepted by Auth.
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))
  const hash = Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('')
  return {login, email:`${hash}@usernames.pedram.local`, username:login}
}
