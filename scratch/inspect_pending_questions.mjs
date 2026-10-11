import Database from 'better-sqlite3'
import fs from 'fs'
import { matchingPool } from '../server/questionSelection.js'
import { JOB_PROFILES } from '../shared/jobProfiles.js'

const db = new Database('server/data/exams.db')
const bank = JSON.parse(fs.readFileSync('server/question-bank.json', 'utf8'))
const byCat = {}
for (const q of bank) byCat[q.category] = (byCat[q.category] || 0) + 1
console.log('BANK', byCat, 'total', bank.length)

const exams = db.prepare('SELECT id,title,category,active,question_count FROM exams ORDER BY created_at DESC LIMIT 20').all()
console.log('\nEXAMS')
for (const e of exams) console.log(e)

const pending = db.prepare(`
  SELECT e.id, e.title, e.category, e.active, COUNT(*) AS empty_groups
  FROM exams e
  JOIN exam_question_sets s ON s.exam_id = e.id
  WHERE json_array_length(s.questions_json) = 0
  GROUP BY e.id
`).all()
console.log('\nPENDING')
for (const e of pending) console.log(e)

const emptySets = db.prepare(`
  SELECT e.id AS examId, e.category, s.job_title, s.profile_id, s.settings_json
  FROM exam_question_sets s
  JOIN exams e ON e.id = s.exam_id
  WHERE json_array_length(s.questions_json) = 0
`).all()

console.log('\nEMPTY SET ANALYSIS')
const seen = new Set()
for (const row of emptySets) {
  const key = row.examId + '|' + row.profile_id + '|' + row.job_title
  if (seen.has(key)) continue
  seen.add(key)
  const cfg = JSON.parse(row.settings_json)
  const profile = JOB_PROFILES.find((p) => p.id === row.profile_id)
  let pool = 0
  let poolShared = 0
  let poolMixedLevel = 0
  try {
    pool = matchingPool(bank, row.category, cfg).length
    poolShared = matchingPool(bank, row.category, { ...cfg, includeShared: true }).length
    poolMixedLevel = matchingPool(bank, row.category, { ...cfg, includeShared: true, jobLevel: 'intermediate', difficulty: 'mixed', skills: [] }).length
  } catch (err) {
    console.log({ key, error: err.message, cfg })
    continue
  }
  console.log({
    exam: row.examId.slice(0, 24),
    cat: row.category,
    job: row.job_title,
    profile: row.profile_id,
    specialty: profile?.specialty,
    includeShared: cfg.includeShared,
    jobLevel: cfg.jobLevel,
    difficulty: cfg.difficulty,
    skills: cfg.skills,
    pool,
    poolShared,
    poolMixedLevel,
  })
}
