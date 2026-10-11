import { randomUUID } from 'node:crypto'

export const MONITOR_EVENTS = new Set(['connected', 'disconnected', 'page_hidden', 'page_visible', 'window_blur', 'window_focus', 'page_reload', 'page_leave', 'navigation_attempt', 'fullscreen_exit', 'screen_started', 'screen_stopped', 'screen_denied', 'screen_unavailable', 'returned', 'session_ended'])
export const MONITOR_STATES = new Set(['unavailable', 'denied', 'partial', 'screen', 'stopped', 'pending'])
export function createMonitoringStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS monitoring_events (
    id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, roster_id TEXT, examinee_name TEXT NOT NULL,
    kind TEXT NOT NULL, occurred_at TEXT NOT NULL, duration_ms INTEGER, state_json TEXT NOT NULL,
    client_event_id TEXT UNIQUE
  );
  CREATE INDEX IF NOT EXISTS idx_monitor_exam_candidate ON monitoring_events(exam_id, examinee_name, occurred_at);`)
  function record(session, kind, durationMs, clientEventId) {
    if (!MONITOR_EVENTS.has(kind)) return null
    const duration = Number.isFinite(durationMs) && durationMs >= 0 ? Math.min(Math.round(durationMs), 86400000) : null
    const serverObserved = ['connected', 'disconnected', 'session_ended'].includes(kind)
    const event = { id: randomUUID(), kind, occurredAt: new Date().toISOString(), durationMs: duration,
      source: serverObserved ? 'server' : 'client', confidence: serverObserved ? 'high' : 'signal', serverObserved,
      state: { connected: !!session.connected, monitoringStatus: session.monitoringStatus || 'pending', captureSurface: session.captureSurface || null, questionIndex: session.questionIndex || 0,
        source: serverObserved ? 'server' : 'client', confidence: serverObserved ? 'high' : 'signal', serverObserved } }
    const key = typeof clientEventId === 'string' && clientEventId.length <= 100 ? session.sessionId + ':' + clientEventId : null
    const result = db.prepare('INSERT OR IGNORE INTO monitoring_events VALUES (?,?,?,?,?,?,?,?,?)').run(event.id, session.examId, session.rosterId || null, session.examineeName, kind, event.occurredAt, duration, JSON.stringify(event.state), key)
    return result.changes ? event : null
  }
  function list(examId, name) {
    return db.prepare('SELECT id,kind,occurred_at AS occurredAt,duration_ms AS durationMs,state_json FROM monitoring_events WHERE exam_id=? AND examinee_name=? ORDER BY occurred_at,rowid').all(examId, name)
      .map(({ state_json, ...row }) => { const state = JSON.parse(state_json); return { ...row, source: state.source || 'unknown', confidence: state.confidence || 'unknown', serverObserved: !!state.serverObserved, state } })
  }
  return { record, list }
}
