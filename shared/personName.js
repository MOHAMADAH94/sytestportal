/** أدوات الاسم الثلاثي: تركيب وتقسيم ومطابقة آمنة دون دمج خاطئ. */

export function normalizePersonName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/\s+/g, ' ')
}

export function nameParts(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
}

/** يقسم الاسم الكامل إلى: الاسم / اسم الأب / الكنية (وما زاد يلحق بالكنية). */
export function splitTripleName(full) {
  const parts = nameParts(full)
  if (!parts.length) return { first: '', father: '', family: '' }
  if (parts.length === 1) return { first: parts[0], father: '', family: '' }
  if (parts.length === 2) return { first: parts[0], father: parts[1], family: '' }
  return {
    first: parts[0],
    father: parts[1],
    family: parts.slice(2).join(' '),
  }
}

export function composeTripleName(first, father, family) {
  return [first, father, family]
    .map((part) => String(part || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ')
}

/** يرفض الأسماء غير الثلاثية عند الإضافة أو تصحيح الاسم. */
export function assertTripleName(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ')
  if (!clean) throw new Error('الاسم مطلوب')
  if (nameParts(clean).length < 3) {
    throw new Error('أدخل الاسم الثلاثي كاملاً (الاسم واسم الأب والكنية)')
  }
  return clean
}

/**
 * مطابقة بادئة آمنة: فقط إذا كان الاسم الأقصر مقطعين فأكثر
 * (تفادي دمج «أحمد» مع «أحمد محمد علي»).
 */
export function isSafePrefixNameMatch(a, b) {
  const left = normalizePersonName(a)
  const right = normalizePersonName(b)
  if (!left || !right || left === right) return false
  const shorter = left.length <= right.length ? left : right
  const longer = left.length <= right.length ? right : left
  if (nameParts(shorter).length < 2) return false
  return longer.startsWith(`${shorter} `)
}
