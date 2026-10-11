import { WebSocketServer } from 'ws'
import { MONITOR_STATES } from './monitoring.js'
import { parseCookies } from './runtimeSecurity.js'

let activeMonitor
export function attachLiveMonitor(httpServer, _jwtSecret, { db, verifyToken, canWatch, monitoring, evaluation, allowedOrigins }) {
  const sessions = new Map(), watchers = new Set()
  let closing = false
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 950000 })
  function publicSession(s, frames = true) {
    const run = db.prepare('SELECT question_index, json_array_length(questions_json) AS total, deadline_at FROM evaluation_runs WHERE roster_id=?').get(s.rosterId)
    const freshFrame = s.connected && s.screenSharing && Date.now() - (s.frameAt || 0) < 5000
    return { sessionId: s.sessionId, rosterId: s.rosterId, examineeName: s.examineeName, examId: s.examId, examTitle: s.examTitle,
      category: s.category, oralRole: s.oralRole, questionIndex: run?.question_index ?? s.questionIndex ?? 0, questionTotal: run?.total ?? s.questionTotal ?? 0,
      progress: (run?.total || s.questionTotal) ? Math.round((run?.question_index ?? s.questionIndex ?? 0) / (run?.total || s.questionTotal) * 100) : 0,
      secondsLeft: run ? Math.max(0, Math.ceil((Date.parse(run.deadline_at) - Date.now()) / 1000)) : s.secondsLeft ?? null, screenSharing: freshFrame, monitoringStatus: freshFrame ? s.monitoringStatus : s.monitoringStatus === 'screen' ? 'partial' : s.monitoringStatus,
      connected: s.connected, captureSurface: s.captureSurface, lastSeen: s.lastSeen, frameAt: s.frameAt,
      hasFrame: !!(freshFrame && s.frame), frame: frames && freshFrame ? s.frame : null, events: s.events.slice(-30) }
  }
  function visible(user, s) {
    try { return canWatch(user, db.prepare('SELECT * FROM exams WHERE id=?').get(s.examId)) } catch { return false }
  }
  function listSessionsForUser(user, frames = true) { return [...sessions.values()].filter((s) => visible(user, s)).map((s) => publicSession(s, frames)) }
  function broadcast(s, type = 'live:update') {
    for (const ws of watchers) {
      try {
        const user = verifyToken(ws.token)
        if (ws.readyState !== 1 || !visible(user, s)) continue
        if (ws.bufferedAmount > 1500000) continue
        const subscribed = ws.subscriptions?.has(s.sessionId) === true
        ws.send(JSON.stringify(type === 'live:ended' ? { type, sessionId: s.sessionId } : { type, session: publicSession(s, subscribed) }))
      } catch { ws.close(4002, 'session invalid') }
    }
  }
  function record(s, kind, duration, eventId) {
    if (closing) return
    const event = monitoring.record(s, kind, duration, eventId)
    if (event) { s.events.push(event); if (s.events.length > 30) s.events.shift(); broadcast(s) }
  }
  function endSession(id) {
    const s = sessions.get(id)
    if (!s) return
    s.screenSharing = false; s.frame = null; s.monitoringStatus = 'stopped'
    record(s, 'session_ended')
    if (s.ws?.readyState === 1) { s.ws.send(JSON.stringify({ type: 'live:stop' })); s.ws.close(4000, 'session ended') }
    broadcast(s, 'live:ended'); sessions.delete(id)
  }
  wss.on('connection', (ws, req) => {
    try {
      const origin = req.headers.origin;
      const host = req.headers.host;
      const isSameHost = Boolean(host && origin && (origin === 'http://' + host || origin === 'https://' + host));
      if (origin && !isSameHost && !allowedOrigins.includes(origin)) return ws.close(4003, 'origin denied');
      const token = parseCookies(req.headers.cookie).exam_session || new URL(req.url || '', 'http://localhost').searchParams.get('token')
      const user = verifyToken(token)
      ws.token = token
      if (['admin', 'operator', 'commander', 'committee_manager', 'committee_member'].includes(user.role)) {
        ws.subscriptions = new Set()
        watchers.add(ws); ws.send(JSON.stringify({ type: 'live:snapshot', sessions: listSessionsForUser(user, false) }))
        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(String(data))
            if (msg.type !== 'live:subscribe') return
            ws.subscriptions.clear()
            const selected = sessions.get(String(msg.sessionId || ''))
            if (selected && visible(user, selected)) {
              ws.subscriptions.add(selected.sessionId)
              ws.send(JSON.stringify({ type: 'live:update', session: publicSession(selected, true) }))
            }
          } catch { /* تجاهل رسالة اشتراك غير صالحة */ }
        })
        ws.on('close', () => watchers.delete(ws)); return
      }
      if (user.role !== 'examinee') return ws.close(4003, 'forbidden')
      const exam = db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(user.examId)
      const roster = db.prepare('SELECT * FROM exam_roster WHERE id=? AND exam_id=? AND name=?').get(user.rosterId, user.examId, user.examineeName)
      if (!exam || !roster || db.prepare('SELECT id FROM attempts WHERE exam_id=? AND examinee_name=?').get(exam.id, roster.name)) return ws.close(4004, 'exam unavailable')
      const run = db.prepare('SELECT * FROM evaluation_runs WHERE roster_id=?').get(roster.id)
      const hasOralSessions = typeof evaluation?.hasSessions === 'function' ? evaluation.hasSessions(roster.id) : false
      if (hasOralSessions && (!run || run.status !== 'active')) return ws.close(4000, 'not active')
      const sessionId = exam.id + ':' + roster.id
      const previous = sessions.get(sessionId)
      if (previous?.ws?.readyState === 1) { previous.ws.send(JSON.stringify({ type: 'live:stop' })); previous.ws.close(4000, 'replaced') }
      const s = { ...previous, sessionId, examId: exam.id, rosterId: roster.id, examineeName: roster.name, examTitle: exam.title,
        category: exam.category, oralRole: exam.oral_role, user, token, connected: true, screenSharing: false, frame: null,
        monitoringStatus: 'pending', lastSeen: Date.now(), ws, events: previous?.events || monitoring.list(exam.id, roster.name).slice(-30) }
      sessions.set(sessionId, s)
      record(s, previous ? 'returned' : 'connected', previous?.disconnectedAt ? Date.now() - previous.disconnectedAt : undefined)
      let windowStart = Date.now(), messageCount = 0
      ws.on('message', (data) => {
        try {
          if (sessions.get(sessionId)?.ws !== ws) return
          if (Date.now() - windowStart > 1000) { windowStart = Date.now(); messageCount = 0 }
          if (++messageCount > 25) return
          verifyToken(token)
          const msg = JSON.parse(String(data))
          s.lastSeen = Date.now()
          if (['live:heartbeat', 'live:state', 'live:frame'].includes(msg.type)) {
            for (const field of ['questionIndex', 'questionTotal', 'secondsLeft']) if (Number.isFinite(msg[field]) && msg[field] >= 0) s[field] = Math.min(msg[field], 100000)
            s.screenSharing = msg.screenSharing === true
            if (MONITOR_STATES.has(msg.monitoringStatus)) s.monitoringStatus = msg.monitoringStatus
            if (['monitor', 'window', 'browser', 'unknown'].includes(msg.captureSurface)) s.captureSurface = msg.captureSurface
            if (!s.screenSharing) s.frame = null
            if (msg.type === 'live:frame' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(msg.frame || '') && msg.frame.length < 900000 && s.screenSharing) { s.frame = msg.frame; s.frameAt = Date.now() }
            broadcast(s)
          }
          if (msg.type === 'live:event') record(s, msg.kind, msg.durationMs, msg.eventId)
          // Navigation/unmount reports are events, not authority to end the server-side exam.
          if (msg.type === 'live:end') record(s, 'page_leave')
        } catch { /* Discard invalid messages without broadcasting untrusted data. */ }
      })
      ws.on('close', () => {
        if (sessions.get(sessionId)?.ws !== ws) return
        s.ws = null; s.connected = false; s.screenSharing = false; s.frame = null; s.disconnectedAt = Date.now()
        if (s.monitoringStatus === 'screen') s.monitoringStatus = 'partial'
        record(s, 'disconnected')
      })
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', event: 'ws_connection_error', message: err?.message, stack: err?.stack }))
      ws.close(4002, 'invalid token')
    }
  })
  const timer = setInterval(() => {
    evaluation.expireRuns()
    for (const s of sessions.values()) {
      const exam = db.prepare('SELECT active FROM exams WHERE id=?').get(s.examId)
      const run = db.prepare('SELECT status,deadline_at FROM evaluation_runs WHERE roster_id=?').get(s.rosterId)
      let invalid = false
      try { verifyToken(s.token) } catch { invalid = true }
      if (run?.status === 'active' && Date.now() >= Date.parse(run.deadline_at)) {
        try { evaluation.progress(s.user, { answers: {} }, true) } catch { /* exam may have stopped */ }
        endSession(s.sessionId); continue
      }
      if (invalid || !exam?.active || (run && run.status !== 'active') || db.prepare('SELECT id FROM attempts WHERE exam_id=? AND examinee_name=?').get(s.examId, s.examineeName)) { endSession(s.sessionId); continue }
      if (s.connected && Date.now() - s.lastSeen > 20000) s.ws?.terminate()
      if (!s.connected && Date.now() - s.lastSeen > 240000) { endSession(s.sessionId); continue }
      broadcast(s)
    }
  }, 3000)
  timer.unref()
  httpServer.on('close', () => { closing = true; sessions.clear(); clearInterval(timer); for (const ws of wss.clients) ws.terminate(); wss.close() })
  activeMonitor = { listSessionsForUser, endSessionByExaminee(examId, name) { for (const s of sessions.values()) if (s.examId === examId && s.examineeName === name) endSession(s.sessionId) } }
  return activeMonitor
}
export function getLiveSessionsForRest(user) { return activeMonitor?.listSessionsForUser(user, false) || [] }
