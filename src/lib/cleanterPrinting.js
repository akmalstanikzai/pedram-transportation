const bridge = 'http://localhost:9100'

// Only called after the user taps Print. A request on page load can suppress
// Android Chrome's permission prompt for access to other apps on the device.
export async function connectCleanter(fetcher = fetch) {
  const response = await fetcher(`${bridge}/health`, {signal:AbortSignal.timeout(60000)})
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
  const response = await fetcher(`${bridge}/print`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({paperWidth:paper === '58' ? 58 : 80,cut:false,content}),
    signal:AbortSignal.timeout(120000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.status !== 'printed') {
    throw new Error(response.ok ? 'CLEANTER_UNCONFIRMED' : result.error || 'CLEANTER_PRINT_FAILED')
  }
}
