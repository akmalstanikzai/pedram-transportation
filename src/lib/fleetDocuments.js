import { validateFile } from './operations.js'

export const documentCategories = {
  vehicle: [
    [
      'photos',
      'Vehicle photos',
      'عکس‌های واسطه',
      'Clear photos of the vehicle, including its plate.',
      'عکس‌های واضح واسطه، همراه با پلیت.',
    ],
    [
      'permit',
      'Road permit',
      'جواز سیر',
      'A copy of the vehicle’s road permit.',
      'کاپی جواز سیر واسطه.',
    ],
    [
      'card',
      'Vehicle card',
      'کارت واسطه',
      'The vehicle registration card, front and back.',
      'روی و پشت کارت ثبت واسطه.',
    ],
    [
      'booklet',
      'Vehicle booklet',
      'کتابچه واسطه',
      'Relevant pages of the vehicle registration booklet.',
      'صفحات مربوط کتابچه ثبت واسطه.',
    ],
    [
      'international',
      'International certificate',
      'سرتفیکت بین‌المللی',
      'International transport certificate, if applicable.',
      'سرتفیکت حمل‌ونقل بین‌المللی، در صورت موجود بودن.',
    ],
  ],
  owner: [
    [
      'identity',
      'CNIC / Tazkira',
      'تذکره',
      'A clear copy of the owner’s identity document, front and back.',
      'کاپی واضح روی و پشت تذکره مالک.',
    ],
  ],
  driver: [
    [
      'identity',
      'CNIC / Tazkira',
      'تذکره',
      'A clear copy of the driver’s identity document, front and back.',
      'کاپی واضح روی و پشت تذکره راننده.',
    ],
    [
      'licence',
      'Driving licence',
      'لایسنس رانندگی',
      'The driver’s licence, front and back.',
      'روی و پشت لایسنس رانندگی.',
    ],
    [
      'health',
      'Health card',
      'کارت صحت',
      'The driver’s health card or medical certificate, if available.',
      'کارت صحت یا تصدیق صحی راننده، در صورت موجود بودن.',
    ],
    [
      'contract',
      'Contract',
      'قرارداد',
      'The signed driver agreement, if available.',
      'قرارداد امضاشده راننده، در صورت موجود بودن.',
    ],
  ],
}

export const documentAccept = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.tif,.tiff'

// Keep the document ID and path stable when retrying an interrupted upload.
// The parent record must already exist before storage or metadata writes begin.
export async function uploadFleetDocument(kind, parentId, job, { rpc, storage }) {
  const mime = validateFile(job.file)
  const path = await rpc('reserve_fleet_document', {
    p_id: job.id,
    p_kind: kind,
    p_parent: parentId,
    p_type: job.category,
    p_name: job.file.name,
    p_mime: mime,
    p_size: job.file.size,
    p_expires: job.expiry || null,
  })
  const { error } = await storage.upload(path, job.file, { contentType: mime, upsert: false })
  if (
    error &&
    String(error.statusCode) !== '409' &&
    !/already exists|duplicate/i.test(error.message)
  )
    throw error
  await rpc('complete_fleet_document', { p_id: job.id })
}
