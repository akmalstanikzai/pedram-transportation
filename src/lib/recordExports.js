import dariFontUrl from '@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2?url'
import { createReceiptImages } from './receiptImage.js'
import { receiptSections, PRINT_CREDIT } from './receiptLayout.js'
import { connectCleanter, printCleanterImages } from './cleanterPrinting.js'

const printStyles = `
  * { box-sizing: border-box; }
  body { color: #000; font: 10pt/1.5 "Pedram Print", Tahoma, Arial, sans-serif; margin: 0; }
  .document { margin: 0 auto; }
  .print-toolbar { max-width: 700px; margin: 14px auto; display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
  .print-toolbar label { display: grid; gap: 4px; }
  button, select { font: inherit; padding: 10px 12px; min-height: 44px; cursor: pointer; }
  .print-toolbar p, .image-links { flex-basis: 100%; margin: 0; }
  .image-links a { display: block; padding: 10px; overflow-wrap: anywhere; }
  header { display: flex; gap: 14px; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 12px; }
  .logo { width: 64px; height: 60px; object-fit: contain; flex: none; }
  .company { font-weight: 700; }
  h1 { margin: 2px 0 0; font-size: 18pt; line-height: 1.4; overflow-wrap: anywhere; }
  .subtitle { margin: 4px 0 0; overflow-wrap: anywhere; }
  h2 { margin: 14px 0 5px; font-size: 11pt; break-after: avoid; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th, td { border: 1px solid #aaa; padding: 5px 8px; text-align: start; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #eee; font-weight: 700; }
  .details th { width: 33%; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .numeric { text-align: end; font-variant-numeric: tabular-nums; }
  .report-note { margin: 10px 0; }
  .receipt .a4-report, .a4 .receipt-report { display: none; }
  .a4 .document { width: 184mm; max-width: 100%; }
  .receipt .document { display: flow-root; width: var(--receipt-width); max-width: 100%; padding: 2mm 4mm; }
  .receipt header { display: block; text-align: center; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px; }
  .receipt .logo { width: 45px; height: 43px; }
  .receipt h1 { font-size: 13pt; }
  .receipt .company { font-size: 10pt; }
  .receipt .subtitle { font-size: 9pt; }
  .receipt-section { border-top: 1px dashed #000; padding-top: 5px; margin-top: 7px; }
  .receipt-section:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
  .receipt-section h2 { text-align: center; margin: 4px 0; font-size: 9pt; }
  .receipt .receipt-table { font-size: 8pt; line-height: 1.35; margin: 0 0 3px; }
  .receipt .receipt-table th, .receipt .receipt-table td { border: .5pt solid #555; padding: .8mm .5mm; text-align: center; white-space: pre-wrap; }
  .receipt .receipt-table th { background: #f3f3f3; font-size: 7.5pt; }
  .receipt .record-end { margin-bottom: 6px; }
  .report-closing { break-inside: avoid; page-break-inside: avoid; break-before: avoid; }
  .receipt .report-note { text-align: center; font-size: 8pt; margin: 4px 0 0; overflow-wrap: anywhere; }
  .report-credit { direction: ltr; text-align: center; font: 7pt/1.3 Arial, sans-serif; border-top: 1px solid #888; margin-top: 7px; padding-top: 4px; break-inside: avoid; }
  .receipt .report-credit { margin-top: 4px; padding-top: 3px; }
  .receipt-section:last-child { break-after: avoid; }
  .report-section + .report-section { border-top: 1px solid #777; margin-top: 10px; padding-top: 4px; }
  @media screen { body { padding: 0 12px 24px; background: #fff; } }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; padding: 0; }
    .print-toolbar { display: none; }
    .a4 .document, .receipt .document { max-width: none; }
  }
`

export function printRecord({ language, title, subtitle, sections, note }) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return false
  printWindow.opener = null
  const doc = printWindow.document, dari = language === 'fa'
  const android = /Android/i.test(window.navigator?.userAgent || '')
  const t = (en,fa) => dari ? fa : en
  const company = t('Pedram International Transport','شرکت ترانسپورتی بین‌المللی پدرام')
  const report = {language,title,subtitle,sections,note,company}
  doc.documentElement.lang = dari ? 'fa' : 'en'
  doc.documentElement.dir = dari ? 'rtl' : 'ltr'
  doc.title = title
  function append(parent, tag, value, className) {
    const node = doc.createElement(tag)
    if (value != null) node.textContent = value
    if (className) node.className = className
    parent.append(node)
    return node
  }
  const viewport = append(doc.head,'meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1'
  const fontUrl = new URL(dariFontUrl,window.location.href).href
  append(doc.head,'style',`@font-face { font-family: "Pedram Print"; src: url("${fontUrl}") format("woff2"); font-weight: 100 900; font-display: block; }\n${printStyles}`)
  const paperStyle = append(doc.head,'style')
  const toolbar = append(doc.body,'div',null,'print-toolbar')
  const button = append(toolbar,'button',t('Print / Save PDF','چاپ / ذخیره PDF'))
  const paperLabel = append(toolbar,'label')
  append(paperLabel,'span',t('Paper','کاغذ'))
  const paperSelect = append(paperLabel,'select')
  for (const [value,en,fa] of [['80','80 mm receipt','رسید 80 میلی‌متر'],['58','58 mm receipt','رسید 58 میلی‌متر'],['a4','A4 / PDF','A4 / PDF']]) {
    const option = append(paperSelect,'option',t(en,fa)); option.value = value
  }
  let paper = '80'
  try { const saved = window.localStorage.getItem('pedram-print-paper'); if (['80','58','a4'].includes(saved)) paper = saved } catch { /* Printing also works when browser storage is unavailable. */ }
  paperSelect.value = paper
  const cleanterButton = android
    ? append(toolbar,'button',t('Print receipt (Cleanter)','چاپ رسید (Cleanter)')) : null
  const imageButton = append(toolbar,'button',t('Prepare receipt images','آماده‌سازی عکس رسید'))
  append(toolbar,'p',t('Windows: choose your installed receipt printer. Android: select your Bluetooth print service, or download the images below and open them in the printing app.','ویندوز: چاپگر رسید نصب‌شده را انتخاب کنید. اندروید: سرویس چاپ بلوتوث را انتخاب کنید، یا عکس‌ها را دانلود کرده در برنامه چاپ باز کنید.'))
  const imageLinks = append(toolbar,'div',null,'image-links')
  const status = append(toolbar,'p'); status.setAttribute('role','status')
  const document = append(doc.body,'main',null,'document')
  const header = append(document,'header')
  const logo = append(header,'img',null,'logo'); logo.alt = 'Pedram'
  logo.src = new URL(`${import.meta.env.BASE_URL}pedram-logo.jpeg`,window.location.href).href
  const heading = append(header,'div')
  append(heading,'div',company,'company'); append(heading,'h1',title)
  if (subtitle) append(heading,'p',subtitle,'subtitle')
  const a4 = append(document,'div',null,'a4-report')
  for (const section of sections) {
    const group = append(a4,'section',null,'report-section')
    if (section.title) append(group,'h2',section.title)
    const table = append(group,'table',null,section.headers ? '' : 'details')
    if (section.widths) { const columns = append(table,'colgroup'); section.widths.forEach(width => { append(columns,'col').style.width = `${width}%` }) }
    if (section.headers) {
      const row = append(append(table,'thead'),'tr')
      section.headers.forEach((value,index) => { append(row,'th',value,section.numeric?.includes(index) ? 'numeric' : '').scope = 'col' })
    }
    const body = append(table,'tbody')
    for (const values of section.rows) {
      const row = append(body,'tr')
      values.forEach((value,index) => {
        const tag = !section.headers && index === 0 ? 'th' : 'td'
        const cell = append(row,tag,value === '' || value == null ? '—' : value,section.numeric?.includes(index) ? 'numeric' : '')
        if (tag === 'th') cell.scope = 'row'
      })
    }
  }
  const receipt = append(document,'div',null,'receipt-report')
  const closing = append(document,'div',null,'report-closing')
  if (note) append(closing,'p',note,'report-note')
  append(closing,'footer',PRINT_CREDIT,'report-credit')
  let renderedPaper = ''
  function renderReceipt() {
    if (renderedPaper === paper) return
    renderedPaper = paper; receipt.textContent = ''
    for (const section of receiptSections(sections,paper)) {
      const group = append(receipt,'section',null,'receipt-section')
      if (section.title) append(group,'h2',section.title)
      for (const data of section.tables) {
        const table = append(group,'table',null,data.recordEnd ? 'receipt-table record-end' : 'receipt-table')
        const columns = append(table,'colgroup')
        data.widths.forEach(width => { append(columns,'col').style.width = `${width}%` })
        const headers = append(append(table,'thead'),'tr')
        data.headers.forEach(value => { append(headers,'th',value).scope = 'col' })
        const body = append(table,'tbody')
        for (const values of data.rows) {
          const row = append(body,'tr')
          values.forEach(value => append(row,'td',value))
        }
      }
    }
  }
  const imageUrls = []
  let receiptBusy = false
  function applyPaper() {
    doc.body.className = paper === 'a4' ? 'a4' : 'receipt'
    if (paper !== 'a4') renderReceipt()
    document.style.setProperty('--receipt-width',`${paper === '58' ? 58 : 80}mm`)
    imageButton.disabled = paper === 'a4' || receiptBusy
    if (cleanterButton) cleanterButton.disabled = receiptBusy
    if (paper === 'a4') paperStyle.textContent = '@page { size: A4; margin: 13mm; }'
    // Android's print service supplies the roll sheet size. A shorter explicit
    // CSS page is vertically centered inside that sheet by Chrome, wasting paper.
    else if (android) paperStyle.textContent = '@page { size: auto; margin: 0; }'
    else {
      // Measure at the actual print width, even on a narrow phone. Padding is
      // inside the receipt so driver margins cannot subtract it a second time.
      const previewMaxWidth = document.style.maxWidth
      document.style.maxWidth = 'none'
      const height = Math.max(40,Math.min(1000,Math.ceil((document.getBoundingClientRect?.().height || 0) * 25.4 / 96) + 2))
      document.style.maxWidth = previewMaxWidth || ''
      paperStyle.textContent = `@page { size: ${paper}mm ${height}mm; margin: 0; }`
    }
  }
  applyPaper()
  paperSelect.onchange = () => {
    paper = ['80','58','a4'].includes(paperSelect.value) ? paperSelect.value : '80'
    try { window.localStorage.setItem('pedram-print-paper',paper) } catch { /* Preference only. */ }
    imageUrls.splice(0).forEach(url => printWindow.URL.revokeObjectURL(url)); imageLinks.textContent = ''; status.textContent = ''
    applyPaper()
  }
  // A slow/offline logo or font request must not leave Print unresponsive.
  const ready = new Promise(resolve => {
    const timer = setTimeout(resolve,5000)
    Promise.all([logo.decode().catch(() => {}),doc.fonts.load?.('12px "Pedram Print"').catch(() => {}),doc.fonts.ready])
      .then(() => { clearTimeout(timer); resolve() })
  })
  // Chrome's Share > Print bypasses our button. Refresh after assets load and
  // again for the native print event so the footer is included in the page size.
  ready.then(() => { if (!printWindow.closed) applyPaper() })
  printWindow.addEventListener?.('beforeprint',applyPaper)
  button.onclick = async () => {
    if (receiptBusy) return
    receiptBusy = true; button.disabled = true; paperSelect.disabled = true; imageButton.disabled = true
    if (cleanterButton) cleanterButton.disabled = true
    try {
      await ready
      if (!printWindow.closed) { applyPaper(); printWindow.focus(); printWindow.print() }
    } finally {
      receiptBusy = false; button.disabled = false; paperSelect.disabled = false; imageButton.disabled = paper === 'a4'
      if (cleanterButton) cleanterButton.disabled = false
    }
  }
  imageButton.onclick = async () => {
    if (receiptBusy || paper === 'a4') return
    receiptBusy = true
    const selectedPaper = paper
    imageButton.disabled = true; paperSelect.disabled = true; button.disabled = true
    if (cleanterButton) cleanterButton.disabled = true
    status.textContent = t('Preparing images…','در حال آماده‌سازی عکس‌ها…')
    try {
      await ready
      const images = await createReceiptImages(doc,report,selectedPaper)
      imageUrls.splice(0).forEach(url => printWindow.URL.revokeObjectURL(url)); imageLinks.textContent = ''
      images.forEach((blob,index) => {
        const url = printWindow.URL.createObjectURL(blob); imageUrls.push(url)
        const link = append(imageLinks,'a',`${t('Download image','دانلود عکس')} ${index+1} / ${images.length}`)
        link.href = url; link.download = `pedram-receipt-${selectedPaper}mm-${index+1}.png`
      })
      status.textContent = t('Tap each download link, then open or share the image with your Bluetooth printing app. Print all parts in order.','هر لینک را لمس کنید، سپس عکس را با برنامه چاپ بلوتوث باز یا شریک سازید. تمام بخش‌ها را به ترتیب چاپ کنید.')
    } catch {
      status.textContent = t('Image preparation failed. Use Print / Save PDF, or try again.','آماده‌سازی عکس انجام نشد. از چاپ / ذخیره PDF استفاده کنید یا دوباره کوشش کنید.')
    } finally {
      receiptBusy = false
      imageButton.disabled = paper === 'a4'; paperSelect.disabled = false; button.disabled = false
      if (cleanterButton) cleanterButton.disabled = false
    }
  }
  if (cleanterButton) cleanterButton.onclick = async () => {
    if (receiptBusy) return
    // A receipt action should still work when the preview was set to A4/PDF.
    if (paper === 'a4') {
      paper = '80'; paperSelect.value = paper; applyPaper()
      try { window.localStorage.setItem('pedram-print-paper',paper) } catch { /* Preference only. */ }
    }
    receiptBusy = true
    const selectedPaper = paper
    cleanterButton.disabled = true; imageButton.disabled = true; paperSelect.disabled = true; button.disabled = true
    cleanterButton.textContent = t('Connecting…','در حال اتصال…')
    status.textContent = t('Connecting to Cleanter… Allow access to apps on this device if Chrome asks.','اتصال به Cleanter… اگر کروم اجازه دسترسی به برنامه‌های این دستگاه را خواست، اجازه دهید.')
    let sent = false
    try {
      await connectCleanter(printWindow.fetch.bind(printWindow),printWindow.navigator?.permissions)
      await ready
      cleanterButton.textContent = t('Printing…','در حال چاپ…')
      status.textContent = t('Printing receipt…','در حال چاپ رسید…')
      const images = await createReceiptImages(doc,report,selectedPaper)
      sent = true
      await printCleanterImages(images,selectedPaper,printWindow.fetch.bind(printWindow))
      status.textContent = t('Cleanter reports that the receipt was printed.','Cleanter گزارش داد که رسید چاپ شد.')
    } catch (error) {
      status.textContent = sent
        ? t('Printing was not confirmed. Check the printer and Cleanter job history before trying again.','چاپ تأیید نشد. پیش از کوشش دوباره، چاپگر و تاریخچه چاپ Cleanter را بررسی کنید.')
        : error.message === 'CLEANTER_PERMISSION_DENIED'
          ? t('Chrome blocked access to Cleanter. In this site’s permissions, allow Apps on device. You can also use Print / Save PDF.','کروم دسترسی به Cleanter را مسدود کرده است. در اجازه‌های این سایت، دسترسی به برنامه‌های دستگاه را فعال کنید. چاپ / ذخیره PDF نیز موجود است.')
          : t('Open Cleanter, select the printer and tap Start. In Chrome site permissions, allow Apps on device, then try again. Print / Save PDF is also available.','Cleanter را باز کنید، چاپگر را انتخاب کرده و Start را بزنید. در اجازه‌های سایت کروم، دسترسی به برنامه‌های دستگاه را فعال کنید و دوباره کوشش کنید. چاپ / ذخیره PDF نیز موجود است.')
    } finally {
      receiptBusy = false
      cleanterButton.textContent = t('Print receipt (Cleanter)','چاپ رسید (Cleanter)')
      cleanterButton.disabled = false; imageButton.disabled = paper === 'a4'; paperSelect.disabled = false; button.disabled = false
    }
  }
  // A preview lets mobile users select paper or images before opening the OS dialog.
  return true
}
