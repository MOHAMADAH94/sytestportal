import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { examineeCardInfo } from './examineeCard.js'

const schema = readFileSync(new URL('./db.js', import.meta.url), 'utf8').match(/db\.exec\(`([\s\S]*?)`\)/)[1]

test('the entry card lists the demand title and every remaining evaluation track', () => {
  const db = new Database(':memory:')
  db.exec(schema)
  db.prepare(`INSERT INTO applicants(id,seq_number,name,job_title,job_title_org,extra_json,created_at,updated_at)
    VALUES ('app',1,'عدنان','تقني','فني حاسب','{"نوع المقابلة":"داخلية"}','2026-09-29','2026-09-29')`).run()
  db.prepare(`INSERT INTO exams(id,title,category,level,oral_role,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at,active)
    VALUES ('exam','شفهي','oral','engineer','technician',1,1,'u','','','[]','[]','2026-09-29',1)`).run()
  db.prepare(`INSERT INTO exam_roster(id,exam_id,seq_number,applicant_id,name,username,password_hash,password_plain,qr_token,created_at)
    VALUES ('roster','exam',1,'app','عدنان','u1','','','qr','2026-09-29')`).run()
  db.prepare(`INSERT INTO attempts(id,exam_id,examinee_name,answers_json,score,max_score,started_at,finished_at)
    VALUES ('attempt','exam','عدنان','{}',80,100,'2026-09-29','2026-09-29')`).run()

  const card = examineeCardInfo(db, { applicantId: 'app', name: 'عدنان' })
  assert.equal(card.demandTitle, 'فني حاسب')
  const ids = card.tracks.map((track) => track.id)
  assert.deepEqual(ids, ['writing', 'personality', 'driving', 'maintenance', 'security'])
  assert.equal(card.tracks.find((track) => track.id === 'maintenance').done, true)
  assert.equal(card.tracks.find((track) => track.id === 'driving').done, false)
  db.close()
})
