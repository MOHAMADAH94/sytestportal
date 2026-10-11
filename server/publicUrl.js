export function isPrivateLanHostname(hostname) {
  if (['localhost', '127.0.0.1'].includes(hostname)) return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  if (hostname.endsWith('.local')) return true
  return false
}

export function isAllowedOrigin(originStr, { allowLanHttp = true } = {}) {
  try {
    const u = new URL(originStr)
    if (u.protocol === 'https:') return true
    if (u.protocol === 'http:') {
      if (['localhost', '127.0.0.1'].includes(u.hostname)) return true
      if (allowLanHttp && isPrivateLanHostname(u.hostname)) return true
    }
    return false
  } catch {
    return false
  }
}

export function resolvePublicAppUrl(environment = process.env) {
  const configured = String(environment.PUBLIC_APP_URL || '').trim()
  const fallback = String(environment.APP_ORIGIN || '').split(',').map((item) => item.trim()).find(Boolean)
  const raw = configured || fallback || 'http://localhost:5173'
  let url
  try { url = new URL(raw) } catch { throw new Error('PUBLIC_APP_URL يجب أن يكون عنوانًا كاملاً صالحًا') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PUBLIC_APP_URL يجب أن يحتوي أصل المنصة فقط دون مسار أو بيانات دخول')
  }
  const allowLanHttp = environment.ALLOW_HTTP_LAN !== 'false'
  const isLanAllowed = allowLanHttp && isPrivateLanHostname(url.hostname)
  if (environment.NODE_ENV === 'production' && url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname) && !isLanAllowed) {
    throw new Error('PUBLIC_APP_URL في الإنتاج يجب أن يستخدم HTTPS')
  }
  return url.origin
}

export function buildQrEntryUrl(publicAppUrl, token) {
  if (typeof token !== 'string' || token.length < 40) throw new Error('رمز QR غير صالح')
  return new URL('/enter/' + encodeURIComponent(token), resolvePublicAppUrl({ PUBLIC_APP_URL:publicAppUrl })).toString()
}

