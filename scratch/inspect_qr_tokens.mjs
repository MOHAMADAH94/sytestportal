import Database from 'better-sqlite3'
const db = new Database('server/data/exams.db')
const rows = db
  .prepare(
    `SELECT r.id, r.name, length(r.qr_token) AS len, substr(r.qr_token,1,24) AS prefix,
            r.used, r.qr_expires_at, r.qr_claimed_at, r.exam_id, e.active, e.title, e.deleted_at
     FROM exam_roster r
     JOIN exams e ON e.id = r.exam_id
     ORDER BY r.created_at DESC
     LIMIT 20`,
  )
  .all()
for (const r of rows) {
  console.log({
    name: r.name,
    len: r.len,
    used: r.used,
    expires: r.qr_expires_at,
    claimed: r.qr_claimed_at,
    active: r.active,
    title: r.title,
    deleted: r.deleted_at,
    expired: r.qr_expires_at ? Date.now() > Date.parse(r.qr_expires_at) : false,
  })
}
