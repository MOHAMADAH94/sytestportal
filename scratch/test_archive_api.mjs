import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '../server/data/exams.db'))

async function run() {
  // 1. تسجيل دخول كمسؤول
  const loginRes = await fetch('http://localhost:3001/api/auth/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'K7k-KP7U*YsCyrd_XcTE' })
  })
  const loginData = await loginRes.json()
  const token = loginData.token
  console.log('✅ تم تسجيل دخول المسؤول بنجاح')

  // 2. اختبار تقييم شفهي oral-evaluations
  const oralExam = db.prepare("SELECT id, title, category FROM exams WHERE category = 'oral' LIMIT 1").get()
  if (oralExam) {
    let rosterRow = db.prepare('SELECT * FROM exam_roster WHERE exam_id = ? LIMIT 1').get(oralExam.id)
    if (!rosterRow) {
      const rid = `rst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const rname = `مرشح شفهي ${Date.now()}`
      db.prepare(`INSERT INTO exam_roster (id, exam_id, seq_number, name, username, password_hash, password_plain, qr_token, display_id, org, job_title, rank, created_at)
        VALUES (?, ?, 1, ?, ?, '', '', ?, 'EMP-ORAL-1', 'اللواء الأول', 'فني اتصالات', 'ملازم', datetime('now'))
      `).run(rid, oralExam.id, rname, `user_${Date.now()}`, `qr_${Date.now()}`)
      rosterRow = db.prepare('SELECT * FROM exam_roster WHERE id = ?').get(rid)
    }

    const oralRes = await fetch(`http://localhost:3001/api/admin/exams/${oralExam.id}/oral-evaluations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        examineeName: rosterRow.name,
        questions: [
          { id: 'q1', text: 'ما هي خبرتك الفنية؟', answer: 'خبرة 5 سنوات في شبكات الاتصال', points: 10, awarded: 9 },
          { id: 'q2', text: 'كيف تتعامل مع الأعطال الطارئة؟', answer: 'اتباع بروتوكول التشخيص الفوري', points: 10, awarded: 8 }
        ]
      })
    })
    const oralData = await oralRes.json()
    console.log('✅ استجابة POST oral-evaluations:', oralData.ok ? 'نجحت' : oralData)
  }

  // 3. اختبار manual-result (شخصية / نظري)
  const personalityExam = db.prepare("SELECT id, title, category FROM exams WHERE category = 'personality' LIMIT 1").get()
  if (personalityExam) {
    let pRoster = db.prepare('SELECT * FROM exam_roster WHERE exam_id = ? LIMIT 1').get(personalityExam.id)
    if (!pRoster) {
      const pid = `rst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const pname = `مرشح شخصية ${Date.now()}`
      db.prepare(`INSERT INTO exam_roster (id, exam_id, seq_number, name, username, password_hash, password_plain, qr_token, display_id, org, job_title, rank, created_at)
        VALUES (?, ?, 1, ?, ?, '', '', ?, 'EMP-PERS-1', 'قيادة العمليات', 'إداري', 'نقيب', datetime('now'))
      `).run(pid, personalityExam.id, pname, `user_p_${Date.now()}`, `qr_p_${Date.now()}`)
      pRoster = db.prepare('SELECT * FROM exam_roster WHERE id = ?').get(pid)
    }

    const persRes = await fetch(`http://localhost:3001/api/admin/exams/${personalityExam.id}/manual-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        examineeName: pRoster.name,
        answers: {}
      })
    })
    const persData = await persRes.json()
    console.log('✅ استجابة POST manual-result (personality):', persData.ok ? 'نجحت' : persData)
  }

  // 4. فحص جميع السجلات في الأرشيف الموحد
  const allRes = await fetch('http://localhost:3001/api/admin/assessment-archive', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const allData = await allRes.json()
  console.log(`\n=== إجمالي السجلات في الأرشيف الموحد: ${allData.total} ===`)
  for (const rec of allData.archive) {
    console.log(`- [${rec.category}] ${rec.examineeName} | النتيجة: ${rec.score}/${rec.maxScore} (${rec.percent}%) | الرتبة: ${rec.rank} | الجهة: ${rec.org} | الاختبار: ${rec.examTitle}`)
  }

  // 5. اختبار RBAC: تسجيل دخول كمشغل والتحقق من حجب الرتبة وتصفية الفئة
  const opLoginRes = await fetch('http://localhost:3001/api/auth/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'oral_tech', password: 'GF-Ntr_Q5o7u-W96sMj+' })
  })
  const opLoginData = await opLoginRes.json()
  if (opLoginData.token) {
    const opArchiveRes = await fetch('http://localhost:3001/api/admin/assessment-archive', {
      headers: { Authorization: `Bearer ${opLoginData.token}` }
    })
    const opArchiveData = await opArchiveRes.json()
    console.log(`\n=== اختبار صلاحيات المشغل (oral_tech) ===`)
    console.log(`- عدد السجلات الظاهرة للمشغل: ${opArchiveData.total}`)
    const nonOral = opArchiveData.archive?.filter(r => r.category !== 'oral')
    console.log(`- هل ظهرت أي فئة غير شفهي؟: ${nonOral?.length === 0 ? 'لا (سليم ✅)' : 'نعم (خطأ ❌)'}`)
    const visibleRanks = opArchiveData.archive?.filter(r => r.rank != null)
    console.log(`- هل ظهرت أي رتبة للمشغل؟: ${visibleRanks?.length === 0 ? 'لا، محجوبة تماماً (سليم ✅)' : 'نعم، ظهرت رتبة (خطأ ❌)'}`)
  } else {
    console.error('فشل تسجيل دخول المشغل:', opLoginData)
  }

  db.close()
}

run().catch(console.error)
