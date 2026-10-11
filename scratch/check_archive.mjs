import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '../server/data/exams.db'))

console.log('\n=== آخر 10 محاولات (attempts) ===')
const attempts = db.prepare(`
  SELECT a.id, a.exam_id, a.examinee_name, a.score, a.max_score, 
         e.category, e.title, a.finished_at
  FROM attempts a
  JOIN exams e ON e.id = a.exam_id
  ORDER BY a.finished_at DESC LIMIT 10
`).all()
console.table(attempts.map(r => ({
  name: r.examinee_name,
  exam: r.title,
  category: r.category,
  score: `${r.score}/${r.max_score}`,
  date: r.finished_at
})))

console.log('\n=== جدول oral_archive ===')
const archive = db.prepare('SELECT * FROM oral_archive ORDER BY archived_at DESC LIMIT 10').all()
console.log('Count:', archive.length)
console.table(archive.map(r => ({
  name: r.examinee_name,
  exam: r.exam_title,
  score: `${r.score}/${r.max_score}`,
  date: r.archived_at
})))

console.log('\n=== هل جدول oral_archive موجود؟ ===')
const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='oral_archive'").get()
console.log(tableInfo ? 'موجود ✅' : 'غير موجود ❌')

db.close()
