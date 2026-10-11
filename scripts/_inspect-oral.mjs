import { db } from '../server/db.js'

const exams = db
  .prepare(
    `SELECT id, title, category, oral_role, capacity, created_at, active
     FROM exams
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 20`,
  )
  .all()

for (const e of exams) {
  console.log('---')
  console.log(e.title)
  console.log({ id: e.id, category: e.category, oral_role: e.oral_role, capacity: e.capacity, active: e.active })
  if (e.category === 'oral') {
    const roster = db
      .prepare('SELECT name, job_title FROM exam_roster WHERE exam_id=? ORDER BY seq_number')
      .all(e.id)
    console.log('roster:', roster.map((r) => `${r.name} (${r.job_title || '—'})`).join(' | '))
    const cfg = db.prepare('SELECT settings_json FROM job_exam_configs WHERE exam_id=?').get(e.id)
    if (cfg) {
      try {
        const s = JSON.parse(cfg.settings_json)
        console.log('autoTrack:', s.autoTrack, 'autoCoverKey:', s.autoCoverKey)
      } catch {}
    }
  }
}
