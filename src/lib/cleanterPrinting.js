const bridge = 'http://localhost:9100'

async function request(url, options, timeout, fetcher) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(),timeout)
  try { return await fetcher(url,{...options,signal:controller.signal}) }
  finally { clearTimeout(timer) }
}

// Only called after the user taps Print. A request on page load can suppress
// Android Chrome's permission prompt for access to other apps on the device.
export async function connectCleanter(fetcher = fetch, permissions = globalThis.navigator?.permissions) {
  let permission
  try { permission = (await permissions?.query({name:'local-network-access'}))?.state } catch { /* Older browsers do not expose this permission. */ }
  if (permission === 'denied') throw new Error('CLEANTER_PERMISSION_DENIED')
  // Allow time for the first Chrome permission prompt; an already allowed but
  // stopped service should fail quickly instead of appearing unresponsive.
  const response = await request(`${bridge}/health`,{},permission === 'prompt' ? 60000 : permission === 'granted' ? 4000 : 10000,fetcher)
  if (!response.ok) throw new Error('CLEANTER_UNAVAILABLE')
}

export async function printCleanterImages(images, paper, fetcher = fetch) {
  const content = []
  for (const image of images) {
    const bytes = new Uint8Array(await image.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    }
    content.push({type:'image',base64:btoa(binary),align:'center',dither:false})
  }
  // A single continuous job, with no A4/roll-page padding or cut between parts.
  content.push({type:'feed',lines:1})
  const response = await request(`${bridge}/print`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({paperWidth:paper === '58' ? 58 : 80,cut:false,content}),
  },120000,fetcher)
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.status !== 'printed') {
    throw new Error(response.ok ? 'CLEANTER_UNCONFIRMED' : result.error || 'CLEANTER_PRINT_FAILED')
  }
}
