import Database from 'better-sqlite3'
const db = new Database('server/data/exams.db', { readonly: true })
const cols = db.prepare('PRAGMA table_info(exams)').all().map((c) => c.name)
const deleted = cols.includes('deleted_at') ? 'WHERE deleted_at IS NULL' : ''
const exams = db.prepare(`SELECT id, title, category, oral_role, question_count, active, created_at FROM exams ${deleted} ORDER BY created_at DESC LIMIT 20`).all()
console.log('EXAMS', JSON.stringify(exams, null, 2))
const configs = db.prepare('SELECT exam_id, substr(settings_json, 1, 400) AS s FROM job_exam_configs').all()
console.log('CONFIGS', JSON.stringify(configs, null, 2))
const sets = db.prepare('SELECT exam_id, job_title, profile_id, length(questions_json) AS qlen FROM exam_question_sets').all()
console.log('SETS', JSON.stringify(sets, null, 2))
const cands = db.prepare(`SELECT cc.committee_id, c.name, c.owner_username, c.category, c.oral_role, c.theory_track, cc.applicant_id FROM committee_candidates cc JOIN committees c ON c.id=cc.committee_id`).all()
console.log('CANDS', JSON.stringify(cands, null, 2))
