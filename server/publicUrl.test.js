import test from 'node:test'
import assert from 'node:assert/strict'
import { buildQrEntryUrl, resolvePublicAppUrl } from './publicUrl.js'
import { examDurationMs, secondsPerQuestion } from './examDuration.js'

test('LAN QR URLs support both HTTPS and private LAN HTTP, and preserve the one-time token', () => {
  const token = 'safe-token-'.padEnd(44,'x')
  assert.equal(resolvePublicAppUrl({ NODE_ENV:'production',PUBLIC_APP_URL:'https://192.168.1.20' }),'https://192.168.1.20')
  assert.equal(buildQrEntryUrl('https://192.168.1.20',token),`https://192.168.1.20/enter/${token}`)
  assert.equal(resolvePublicAppUrl({ NODE_ENV:'production',PUBLIC_APP_URL:'http://127.0.0.1:3001' }),'http://127.0.0.1:3001')
  assert.equal(resolvePublicAppUrl({ NODE_ENV:'production',PUBLIC_APP_URL:'http://192.168.1.20:3001' }),'http://192.168.1.20:3001')
  assert.throws(() => resolvePublicAppUrl({ NODE_ENV:'production',PUBLIC_APP_URL:'http://example.com' }),/HTTPS/)
  assert.throws(() => resolvePublicAppUrl({ NODE_ENV:'production',ALLOW_HTTP_LAN:'false',PUBLIC_APP_URL:'http://192.168.1.20:3001' }),/HTTPS/)
  assert.throws(() => resolvePublicAppUrl({ PUBLIC_APP_URL:'https://192.168.1.20/path' }),/دون مسار/)
})

test('QR assessment duration supports long interviews and remains bounded', () => {
  assert.equal(secondsPerQuestion('oral',{}),300)
  assert.equal(examDurationMs('oral',20,{}),100 * 60 * 1000)
  assert.equal(examDurationMs('oral',20,{},{ durationMinutes: 45 }),45 * 60 * 1000)
  assert.equal(examDurationMs('oral',10,{},{ durationMinutes: 600 }),600 * 60 * 1000)
  assert.equal(examDurationMs('oral',10,{},{ durationMinutes: 999 }),600 * 60 * 1000)
  assert.equal(examDurationMs('oral',5,{},{ secondsPerQuestion: 120 }),5 * 120 * 1000)
  assert.equal(secondsPerQuestion('personality',{}),90)
  assert.equal(secondsPerQuestion('oral',{ EXAM_SECONDS_PER_QUESTION_ORAL:'900' }),900)
  assert.equal(secondsPerQuestion('oral',{ EXAM_SECONDS_PER_QUESTION_ORAL:'99999' }),1800)
})
