import Database from 'better-sqlite3'
import { claimRosterByQrToken } from '../server/roster.js'

const db = new Database('server/data/exams.db')
const row = db
  .prepare(
    `SELECT r.qr_token, r.name, e.title, e.active, e.id AS examId,
            (SELECT COUNT(*) FROM committee_assignments a WHERE a.exam_id=e.id) AS committee
     FROM exam_roster r JOIN exams e ON e.id=r.exam_id
     WHERE e.active=1 AND e.deleted_at IS NULL AND r.used=0
     ORDER BY r.created_at DESC LIMIT 3`,
  )
  .all()
for (const r of row) {
  console.log('---', r.name, r.title, 'committee=', r.committee)
  console.log('tokenLen', r.qr_token.length)
  const claim = claimRosterByQrToken(r.qr_token, 'test-device')
  console.log(claim.ok ? 'CLAIM OK' : claim)
}
