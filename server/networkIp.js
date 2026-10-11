import os from 'node:os'

const VIRTUAL_NAME_REGEX = /vEthernet|WSL|VirtualBox|Host-Only|VMware|Loopback|TAP|VPN|Radmin|Tunnel|Tailscale|ZeroTier|Docker/i

export function isVirtualOrSubnetExcluded(name, address) {
  if (VIRTUAL_NAME_REGEX.test(name)) return true
  if (address.startsWith('192.168.56.')) return true
  if (address.startsWith('169.254.')) return true
  return false
}

export function getNetworkCandidates(networkInterfaces = os.networkInterfaces()) {
  const candidates = []
  for (const [name, addrs] of Object.entries(networkInterfaces || {})) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const isExcluded = isVirtualOrSubnetExcluded(name, addr.address)
        candidates.push({
          name,
          address: addr.address,
          isExcluded,
          isWifi: /wi-?fi|wlan|wireless|وايفاي|واي فاي|شبكة.*wi/i.test(name),
          isEthernet: /ethernet|إيثرنت|شبكة.*eth/i.test(name),
        })
      }
    }
  }
  return candidates
}

export function detectPrimaryLanIp({ networkInterfaces = os.networkInterfaces() } = {}) {
  const candidates = getNetworkCandidates(networkInterfaces)
  const valid = candidates.filter((c) => !c.isExcluded)

  const wifi = valid.find((c) => c.isWifi)
  if (wifi) return { ip: wifi.address, interfaceName: wifi.name, mode: 'wifi' }

  const ethernet = valid.find((c) => c.isEthernet)
  if (ethernet) return { ip: ethernet.address, interfaceName: ethernet.name, mode: 'ethernet' }

  if (valid.length > 0) return { ip: valid[0].address, interfaceName: valid[0].name, mode: 'lan' }

  return { ip: '127.0.0.1', interfaceName: 'Loopback (Offline)', mode: 'offline' }
}

export function resolveAutoNetwork(env = process.env, options = {}) {
  const resultEnv = { ...env }
  const publicUrlSetting = String(env.PUBLIC_APP_URL || '').trim()
  const originSetting = String(env.APP_ORIGIN || '').trim()

  const isAutoUrl = !publicUrlSetting || publicUrlSetting.toUpperCase() === 'AUTO'
  const isAutoOrigin = !originSetting || originSetting.toUpperCase() === 'AUTO'

  if (!isAutoUrl && !isAutoOrigin) {
    return { env: resultEnv, detected: null }
  }

  const detected = detectPrimaryLanIp(options)
  const isOffline = detected.mode === 'offline' || detected.ip === '127.0.0.1'
  const port = env.PORT || 3001
  const isHttps = env.USE_HTTPS === 'true' || String(port) === '443'
  const protocol = isHttps ? 'https' : 'http'
  const portSuffix = (isHttps && String(port) === '443') || (!isHttps && String(port) === '80') ? '' : `:${port}`

  const resolvedUrl = isOffline
    ? `http://127.0.0.1:${port}`
    : `${protocol}://${detected.ip}${portSuffix}`

  if (isAutoUrl) {
    resultEnv.PUBLIC_APP_URL = resolvedUrl
  }

  if (isAutoOrigin) {
    // Vite dev UI runs on :5173; without these origins login CORS fails in npm run dev.
    const viteOrigins = 'http://127.0.0.1:5173,http://localhost:5173'
    if (isOffline) {
      resultEnv.APP_ORIGIN = `http://127.0.0.1:${port},http://localhost:${port},${viteOrigins}`
    } else {
      resultEnv.APP_ORIGIN = `${resolvedUrl},http://127.0.0.1:${port},http://localhost:${port},${viteOrigins}`
    }
  }

  return { env: resultEnv, detected }
}

export function extractClientIp(req) {
  if (!req) return ''
  let ip = ''
  if (req.headers && req.headers['x-forwarded-for']) {
    const forwarded = String(req.headers['x-forwarded-for']).split(',')[0].trim()
    if (forwarded) ip = forwarded
  }
  if (!ip) {
    ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || ''
  }
  if (typeof ip === 'string') {
    if (ip.startsWith('::ffff:')) {
      ip = ip.slice(7)
    }
    if (ip === '::1') {
      ip = '127.0.0.1'
    }
  }
  return String(ip || '').trim()
}
