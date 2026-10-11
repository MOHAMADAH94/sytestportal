import test from 'node:test'
import assert from 'node:assert/strict'
import { isVirtualOrSubnetExcluded, detectPrimaryLanIp, resolveAutoNetwork } from './networkIp.js'

test('isVirtualOrSubnetExcluded properly flags virtual and link-local interfaces', () => {
  assert.equal(isVirtualOrSubnetExcluded('vEthernet (WSL)', '172.29.224.1'), true)
  assert.equal(isVirtualOrSubnetExcluded('Radmin VPN', '26.108.62.190'), true)
  assert.equal(isVirtualOrSubnetExcluded('UrbanVPN', '10.7.0.157'), true)
  assert.equal(isVirtualOrSubnetExcluded('Ethernet 2', '192.168.56.1'), true)
  assert.equal(isVirtualOrSubnetExcluded('Unidentified Network', '169.254.10.5'), true)
  assert.equal(isVirtualOrSubnetExcluded('شبكة Wi-Fi', '192.168.1.221'), false)
  assert.equal(isVirtualOrSubnetExcluded('Ethernet', '10.0.0.15'), false)
})

test('detectPrimaryLanIp prioritizes physical Wi-Fi and filters virtual adapters', () => {
  const mockInterfaces = {
    'UrbanVPN': [{ family: 'IPv4', address: '10.7.0.157', internal: false }],
    'Radmin VPN': [{ family: 'IPv4', address: '26.108.62.190', internal: false }],
    'vEthernet (WSL)': [{ family: 'IPv4', address: '172.29.224.1', internal: false }],
    'Ethernet 2': [{ family: 'IPv4', address: '192.168.56.1', internal: false }],
    'شبكة Wi-Fi': [{ family: 'IPv4', address: '192.168.1.221', internal: false }],
  }
  const result = detectPrimaryLanIp({ networkInterfaces: mockInterfaces })
  assert.equal(result.ip, '192.168.1.221')
  assert.equal(result.mode, 'wifi')
})

test('detectPrimaryLanIp falls back to physical Ethernet when Wi-Fi is absent', () => {
  const mockInterfaces = {
    'vEthernet (WSL)': [{ family: 'IPv4', address: '172.29.224.1', internal: false }],
    'Ethernet': [{ family: 'IPv4', address: '10.0.0.88', internal: false }],
  }
  const result = detectPrimaryLanIp({ networkInterfaces: mockInterfaces })
  assert.equal(result.ip, '10.0.0.88')
  assert.equal(result.mode, 'ethernet')
})

test('detectPrimaryLanIp falls back to loopback when completely offline', () => {
  const mockInterfaces = {
    'Loopback': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    'vEthernet (WSL)': [{ family: 'IPv4', address: '172.29.224.1', internal: false }],
  }
  const result = detectPrimaryLanIp({ networkInterfaces: mockInterfaces })
  assert.equal(result.ip, '127.0.0.1')
  assert.equal(result.mode, 'offline')
})

test('resolveAutoNetwork resolves AUTO to LAN http with port and includes local origins', () => {
  const mockInterfaces = {
    'شبكة Wi-Fi': [{ family: 'IPv4', address: '192.168.1.221', internal: false }],
  }
  const { env, detected } = resolveAutoNetwork(
    { PUBLIC_APP_URL: 'AUTO', APP_ORIGIN: 'AUTO', PORT: '3001' },
    { networkInterfaces: mockInterfaces }
  )
  assert.equal(detected.ip, '192.168.1.221')
  assert.equal(env.PUBLIC_APP_URL, 'http://192.168.1.221:3001')
  assert.ok(env.APP_ORIGIN.includes('http://192.168.1.221:3001'))
  assert.ok(env.APP_ORIGIN.includes('http://127.0.0.1:3001'))
})

test('resolveAutoNetwork supports HTTPS mode when USE_HTTPS is enabled', () => {
  const mockInterfaces = {
    'شبكة Wi-Fi': [{ family: 'IPv4', address: '192.168.1.221', internal: false }],
  }
  const { env } = resolveAutoNetwork(
    { PUBLIC_APP_URL: 'AUTO', APP_ORIGIN: 'AUTO', PORT: '443', USE_HTTPS: 'true' },
    { networkInterfaces: mockInterfaces }
  )
  assert.equal(env.PUBLIC_APP_URL, 'https://192.168.1.221')
})

test('resolveAutoNetwork handles offline mode with http loopback', () => {
  const mockInterfaces = {}
  const { env, detected } = resolveAutoNetwork(
    { PUBLIC_APP_URL: 'AUTO', APP_ORIGIN: 'AUTO', PORT: '3001' },
    { networkInterfaces: mockInterfaces }
  )
  assert.equal(detected.ip, '127.0.0.1')
  assert.equal(env.PUBLIC_APP_URL, 'http://127.0.0.1:3001')
  assert.ok(env.APP_ORIGIN.includes('http://127.0.0.1:3001'))
})

test('resolveAutoNetwork preserves manual overrides when not set to AUTO', () => {
  const mockInterfaces = {
    'شبكة Wi-Fi': [{ family: 'IPv4', address: '192.168.1.221', internal: false }],
  }
  const { env, detected } = resolveAutoNetwork(
    { PUBLIC_APP_URL: 'https://custom.domain.local', APP_ORIGIN: 'https://custom.domain.local' },
    { networkInterfaces: mockInterfaces }
  )
  assert.equal(detected, null)
  assert.equal(env.PUBLIC_APP_URL, 'https://custom.domain.local')
  assert.equal(env.APP_ORIGIN, 'https://custom.domain.local')
})
