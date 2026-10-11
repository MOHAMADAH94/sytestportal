import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '../server/data/exams.db'))

console.log('=== فحص جدول assessment_archive ===')
const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assessment_archive'").get()
console.log('وجود الجدول:', tableInfo ? '✅ موجود' : '❌ غير موجود')

const countAll = db.prepare('SELECT COUNT(*) AS c FROM assessment_archive').get().c
console.log('إجمالي السجلات المؤرشفة:', countAll)

const byCategory = db.prepare(`
  SELECT category, COUNT(*) as count 
  FROM assessment_archive 
  GROUP BY category
`).all()
console.log('توزيع السجلات حسب الفئة:', byCategory)

const samples = db.prepare('SELECT id, category, exam_title, examinee_name, score, max_score, percent, archived_at FROM assessment_archive LIMIT 5').all()
console.log('عينة من السجلات:', samples)

db.close()
