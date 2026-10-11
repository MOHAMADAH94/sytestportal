import crypto from 'crypto'
import { db } from './db.js'
import { examineeCardInfo } from './examineeCard.js'
import { pickRosterMeta, upsertExamineeProfile } from './rosterMeta.js'

function qrToken() {
  // 256-bit capability token; لا يعتمد على اسم الشخص أو كلمة مرور مشتركة.
  return crypto.randomBytes(32).toString('base64url')
}

function rotateWeakQrTokens() {
  const rows = db.prepare("SELECT id FROM exam_roster WHERE length(qr_token) < 40 AND used = 0").all()
  const update = db.prepare('UPDATE exam_roster SET qr_token = ? WHERE id = ?')
  for (const row of rows) update.run(qrToken(), row.id)
  if (rows.length) console.log(`✓ تم تدوير ${rows.length} رمز QR قديم`)
}

export function makeDisplayId(examId, seq) {
  const code = examId.replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase() || 'EXAM'
  return `EXM-${code}-${String(seq).padStart(4, '0')}`
}

function rosterUsername(examId, displayId) {
  const suffix = displayId.replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase()
  return `ex_${suffix}`
}

function backfillDisplayIds() {
  const rows = db
    .prepare("SELECT id, exam_id, seq_number FROM exam_roster WHERE display_id IS NULL OR display_id = ''")
    .all()
  const upd = db.prepare('UPDATE exam_roster SET display_id = ? WHERE id = ?')
  for (const r of rows) {
    upd.run(makeDisplayId(r.exam_id, r.seq_number), r.id)
  }
}

backfillDisplayIds()
rotateWeakQrTokens()

function mapRosterRow(r) {
  const displayId = r.display_id || makeDisplayId(r.exam_id, r.seq_number)
  return {
    id: r.id,
    displayId,
    seqNumber: r.seq_number ?? r.seqNumber,
    name: r.name,
    org: r.org || '',
    jobTitle: r.job_title || '',
    rank: r.rank || '',
    extra: r.extra_json ? JSON.parse(r.extra_json) : null,
    ...examineeCardInfo(db, {
      applicantId: r.applicant_id || r.applicantId || null,
      name: r.name,
      jobTitle: r.job_title || r.jobTitle || '',
      extra: r.extra_json ? JSON.parse(r.extra_json) : (r.extra || null),
    }),
    qrToken: r.qr_token ?? r.qrToken,
    used: !!r.used,
    qrStatus: r.qr_status || (r.qr_claimed_at ? 'claimed' : 'issued'),
    qrExpiresAt: r.qr_expires_at || null,
  }
}

/** نقل بيانات الجهة/المسمى من extra إلى الحقول والملفات الشخصية */
function backfillRosterMeta() {
  const rows = db
    .prepare('SELECT id, name, org, job_title, rank, extra_json FROM exam_roster')
    .all()
  const upd = db.prepare(
    'UPDATE exam_roster SET org = ?, job_title = ?, rank = ?, extra_json = ? WHERE id = ?',
  )
  for (const r of rows) {
    const extra = r.extra_json ? JSON.parse(r.extra_json) : {}
    const meta = pickRosterMeta(extra)
    const org = r.org || meta.org || null
    const job = r.job_title || meta.jobTitle || null
    const rank = r.rank || meta.rank || null
    const nextExtra = Object.keys(meta.extra).length ? JSON.stringify(meta.extra) : null
    if ((!r.org && meta.org) || (!r.job_title && meta.jobTitle) || (!r.rank && meta.rank)) {
      upd.run(org, job, rank, nextExtra, r.id)
    }
    upsertExamineeProfile(r.name, { org: org || '', jobTitle: job || '', rank: rank || '' })
  }
}

backfillRosterMeta()

/**
 * قائمة الممتحنين تُبنى من متقدمين موجودين مسبقاً في السجل المركزي (applicants) —
 * لذا org/jobTitle/rank/extra تصل هنا جاهزة ولا حاجة لإعادة استخراجها من extra.
 * @param {string} examId @param {Array<{ seqNumber: number, name: string, org?: string, jobTitle?: string, rank?: string, extra?: Record<string, string> }>} rows
 */
export function insertExamRoster(examId, rows) {
  const insert = db.prepare(`
   INSERT INTO exam_roster (
      id, exam_id, seq_number, applicant_id, display_id, name, org, job_title, rank, extra_json,
      username, password_hash, password_plain, qr_token, used, created_at, qr_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `)

  const created = []
  const now = new Date().toISOString()

  const tx = db.transaction((list) => {
    for (const row of list) {
      const id = `roster-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const token = qrToken()
      const displayId = makeDisplayId(examId, row.seqNumber)
      let username = rosterUsername(examId, displayId)
      while (db.prepare('SELECT id FROM exam_roster WHERE username = ?').get(username)) {
        username = `ex_${Date.now().toString(36)}_${row.seqNumber}`
      }

      const org = row.org || ''
      const jobTitle = row.jobTitle || ''
      const rank = row.rank || ''
      const extra = row.extra || {}
      insert.run(
        id,
       examId,
       row.seqNumber,
        row.id || null,
       displayId,
        row.name,
        org || null,
        jobTitle || null,
        rank || null,
        Object.keys(extra).length ? JSON.stringify(extra) : null,
        username,
        '',
        '',
       token,
       now,
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      )

      upsertExamineeProfile(row.name, { org, jobTitle, rank })

      created.push({
        id,
        applicantId: row.id || null,
        displayId,
        seqNumber: row.seqNumber,
        name: row.name,
        org,
        jobTitle,
        rank,
        extra: Object.keys(extra).length ? extra : null,
        ...examineeCardInfo(db, { applicantId: row.id || null, name: row.name, jobTitle, extra }),
        qrToken: token,
        used: false,
      })
    }
  })

  tx(rows)
  return created
}

export function countRoster(examId) {
  return db.prepare('SELECT COUNT(*) AS c FROM exam_roster WHERE exam_id = ?').get(examId).c
}

export function listRosterPublic(examId) {
  return db
    .prepare(
      `SELECT r.id, r.seq_number, r.display_id, r.name, r.org, r.job_title, r.rank, r.extra_json, r.applicant_id,
              r.qr_token, r.used, r.exam_id, r.qr_claimed_at, r.qr_expires_at,
              CASE
                WHEN EXISTS(SELECT 1 FROM attempts a WHERE a.roster_id=r.id) THEN 'submitted'
                WHEN EXISTS(SELECT 1 FROM evaluation_runs v WHERE v.roster_id=r.id AND v.status='active') THEN 'started'
                WHEN r.qr_claimed_at IS NOT NULL THEN 'claimed'
                ELSE 'issued'
              END AS qr_status
       FROM exam_roster r WHERE r.exam_id = ? ORDER BY r.seq_number ASC`,
    )
    .all(examId)
    .map(mapRosterRow)
}

export function findDisplayIdsByName(name, examIds = null) {
  if (!name?.trim()) return []
  let rows
  if (examIds?.length) {
    const placeholders = examIds.map(() => '?').join(',')
    rows = db
      .prepare(
        `SELECT display_id, exam_id, seq_number FROM exam_roster
         WHERE name = ? AND exam_id IN (${placeholders})`,
      )
      .all(name.trim(), ...examIds)
  } else {
    rows = db
      .prepare('SELECT display_id, exam_id, seq_number FROM exam_roster WHERE name = ?')
      .all(name.trim())
  }
  return rows.map((r) => r.display_id || makeDisplayId(r.exam_id, r.seq_number))
}

/** يستهلك QR بشكل ذري؛ لا يمكن إصدار جلستين من الرمز نفسه، مع إرجاع سبب مفصل في حال الفشل */
export function claimRosterByQrToken(token, deviceId = '') {
  return db.transaction((qrTokenValue, requestedDeviceId) => {
    const row = db
      .prepare(
        `SELECT r.*, e.active AS exam_active, e.title AS exam_title, e.category, e.level, e.oral_role,
                e.capacity, e.question_count, e.username AS exam_username, e.created_at AS exam_created_at
         FROM exam_roster r
         JOIN exams e ON e.id = r.exam_id
         WHERE r.qr_token = ?`,
      )
      .get(qrTokenValue)
    if (!row) {
      const rosterOnly = db.prepare('SELECT id FROM exam_roster WHERE qr_token = ?').get(qrTokenValue)
      if (rosterOnly) {
        return { ok: false, code: 'EXAM_NOT_FOUND', status: 404, error: 'الامتحان المرتبط بهذا الرمز غير موجود في النظام' }
      }
      return { ok: false, code: 'TOKEN_NOT_FOUND', status: 404, error: 'رمز QR غير موجود أو غير صالح' }
    }
    if (!row.exam_active) {
      return { ok: false, code: 'EXAM_INACTIVE', status: 403, error: 'الامتحان المرتبط برمز QR هذا متوقف أو غير نشط حالياً' }
    }
    if (row.qr_expires_at && Date.now() > Date.parse(row.qr_expires_at)) {
      return { ok: false, code: 'TOKEN_EXPIRED', status: 401, error: 'انتهت صلاحية رمز QR هذا' }
    }
    if (db.prepare('SELECT id FROM attempts WHERE roster_id=? OR (exam_id=? AND examinee_name=?) LIMIT 1').get(row.id, row.exam_id, row.name)) {
      return { ok: false, code: 'EXAM_SUBMITTED', status: 403, error: 'تم تقديم هذا الامتحان مسبقاً وتسليمه بنجاح' }
    }
    const normalizedDevice = String(requestedDeviceId || 'legacy').slice(0, 120)
    const run = db.prepare("SELECT status FROM evaluation_runs WHERE roster_id=? AND status='active'").get(row.id)
    if (row.used) {
      const recoverable = run || (row.qr_claimed_at && Date.now() - Date.parse(row.qr_claimed_at) <= 15 * 60 * 1000)
      if (!recoverable) {
        return { ok: false, code: 'TOKEN_ALREADY_USED', status: 401, error: 'تم استخدام رمز QR هذا مسبقاً وتجاوزت مهلة الاستئناف (15 دقيقة)' }
      }
      if (row.qr_device_id && row.qr_device_id !== normalizedDevice) {
        db.prepare('UPDATE exam_roster SET qr_device_id=? WHERE id=?').run(normalizedDevice, row.id)
        row.qr_device_id = normalizedDevice
      }
      return { ...row, ok: true, used: true }
    }
    const sessionId = crypto.randomUUID()
    const claimedAt = new Date().toISOString()
    const claimed = db.prepare('UPDATE exam_roster SET used=1,qr_claimed_at=?,qr_session_id=?,qr_device_id=? WHERE id=? AND used=0')
      .run(claimedAt, sessionId, normalizedDevice, row.id)
    return claimed.changes === 1
      ? { ...row, ok: true, used: true, qr_claimed_at: claimedAt, qr_session_id: sessionId, qr_device_id: normalizedDevice }
      : { ok: false, code: 'CONCURRENT_CLAIM', status: 409, error: 'تم استهلاك الرمز في جلسة أخرى متزامنة' }
  })(token, deviceId)
}

export function markRosterUsed(rosterId) {
  db.prepare('UPDATE exam_roster SET used = 1 WHERE id = ?').run(rosterId)
}

export function rosterPublicRow(r) {
  return mapRosterRow(r)
}
