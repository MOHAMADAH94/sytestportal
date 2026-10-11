import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import Database from 'better-sqlite3'
import { WebSocket } from 'ws'
import { attachLiveMonitor } from './liveMonitor.js'
import { createMonitoringStore } from './monitoring.js'

async function setup(t) {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE exams(id TEXT PRIMARY KEY,active INTEGER,title TEXT,category TEXT,oral_role TEXT);
    CREATE TABLE exam_roster(id TEXT PRIMARY KEY,exam_id TEXT,name TEXT);
    CREATE TABLE attempts(id TEXT,exam_id TEXT,examinee_name TEXT);
    CREATE TABLE evaluation_runs(roster_id TEXT,status TEXT,deadline_at TEXT,question_index INTEGER,questions_json TEXT);
    INSERT INTO exams VALUES('e',1,'Test','oral','network_engineer');
    INSERT INTO exam_roster VALUES('r','e','Candidate');`)
  const monitoring = createMonitoringStore(db), server = http.createServer()
  const tokens = new Map([
    ['admin', { role: 'admin' }], ['other', { role: 'operator', category: 'driving' }],
    ['candidate', { role: 'examinee', examId: 'e', rosterId: 'r', examineeName: 'Candidate' }],
  ])
  const api = attachLiveMonitor(server, '', { db, monitoring, verifyToken: (token) => { if (!tokens.has(token)) throw Error('invalid'); return tokens.get(token) },
    allowedOrigins: ['http://localhost'], canWatch: (u, e) => u.role === 'admin' || u.category === e.category,
    evaluation: { hasSessions: () => false, expireRuns: () => {} } })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const sockets = []
  t.after(async () => { for (const ws of sockets) ws.terminate(); await new Promise((resolve) => server.close(resolve)); db.close() })
  function connect(token, origin = 'http://localhost') {
    const ws = new WebSocket('ws://127.0.0.1:' + server.address().port + '/ws?token=' + token, { origin })
    sockets.push(ws); ws.messages = []; ws.on('message', (raw) => ws.messages.push(JSON.parse(String(raw))))
    return ws
  }
  async function until(ws, predicate) {
    const present = ws.messages.find(predicate)
    if (present) return present
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { ws.off('message', handler); reject(Error('message timeout')) }, 2000)
      function handler(raw) { const msg = JSON.parse(String(raw)); if (predicate(msg)) { clearTimeout(timeout); ws.off('message', handler); resolve(msg) } }
      ws.on('message', handler)
    })
  }
  return { db, monitoring, api, tokens, connect, until }
}
test('unsupported sharing is explicit; frames only reach authorized watchers and vanish when sharing stops', async (t) => {
  const f = await setup(t), admin = f.connect('admin'), other = f.connect('other')
  await Promise.all([once(admin, 'open'), once(other, 'open')])
  const candidate = f.connect('candidate'); await once(candidate, 'open')
  candidate.send(JSON.stringify({ type: 'live:state', monitoringStatus: 'unavailable', screenSharing: false, questionIndex: 1, questionTotal: 3, secondsLeft: 60 }))
  const unavailable = await f.until(admin, (m) => m.session?.monitoringStatus === 'unavailable')
  assert.equal(unavailable.session.frame, null)
  admin.send(JSON.stringify({ type: 'live:subscribe', sessionId: unavailable.session.sessionId }))
  candidate.send(JSON.stringify({ type: 'live:frame', frame: 'data:image/jpeg;base64,/9j/2Q==', screenSharing: true, monitoringStatus: 'screen', captureSurface: 'monitor' }))
  const frame = await f.until(admin, (m) => !!m.session?.frame)
  assert.equal(frame.session.captureSurface, 'monitor')
  assert.equal(other.messages.some((m) => m.session?.frame), false)
  candidate.send(JSON.stringify({ type: 'live:state', screenSharing: false, monitoringStatus: 'stopped' }))
  const stopped = await f.until(admin, (m) => m.session?.monitoringStatus === 'stopped')
  assert.equal(stopped.session.frame, null)
})
test('suspicious events persist, disconnect is immediate, and ending a session sends capture-stop', async (t) => {
  const f = await setup(t), admin = f.connect('admin'); await once(admin, 'open')
  const candidate = f.connect('candidate'); await once(candidate, 'open')
  candidate.send(JSON.stringify({ type: 'live:event', kind: 'window_blur', durationMs: 2500, eventId: 'blur1' }))
  await f.until(admin, (m) => m.session?.events.some((e) => e.kind === 'window_blur'))
  assert.ok(f.monitoring.list('e', 'Candidate').some((e) => e.kind === 'window_blur'))
  candidate.close(); await once(candidate, 'close')
  const disconnected = await f.until(admin, (m) => m.session?.connected === false)
  assert.equal(disconnected.session.frame, null)
  const resumed = f.connect('candidate'); await once(resumed, 'open')
  f.api.endSessionByExaminee('e', 'Candidate')
  await f.until(resumed, (m) => m.type === 'live:stop')
  assert.equal(f.api.listSessionsForUser({ role: 'admin' }).length, 0)
  assert.ok(f.monitoring.list('e', 'Candidate').some((e) => e.kind === 'session_ended'))
})
test('invalid origins and completed exam tokens cannot start screen monitoring', async (t) => {
  const f = await setup(t), badOrigin = f.connect('candidate', 'https://untrusted.example')
  const [code] = await once(badOrigin, 'close'); assert.equal(code, 4003)
  f.db.prepare("INSERT INTO attempts VALUES('a','e','Candidate')").run()
  const completed = f.connect('candidate'); const [completedCode] = await once(completed, 'close'); assert.equal(completedCode, 4004)
})
