import Database from 'better-sqlite3'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.resolve(process.argv[2] || path.join(project, 'server/data/exams.db'))
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'exam-production-validation-'))
const data = path.join(temp, 'data'); await fs.mkdir(data)
const targetPath = path.join(data, 'exams.db')
const source = new Database(sourcePath, { readonly:true, fileMustExist:true })
const tracked = ['exams','attempts','exam_roster','assessment_archive','archive_versions','applicants']
const before = Object.fromEntries(tracked.map((table) => [table, source.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]))
await source.backup(targetPath); source.close()
const seeded = new Database(targetPath)
const loadQuestion = { id:'production-load-question', type:'mcq', category:'theory', text:'اختر الإجابة الصحيحة', choices:[{id:'a',text:'صحيح'},{id:'b',text:'خطأ'}], correctAnswer:'a', points:1 }
seeded.prepare("INSERT INTO exams(id,title,category,level,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at,active) VALUES('production-load-exam','اختبار حمل معزول','theory','technician',100,1,'production-load','','','[\"production-load-question\"]',?,'now',1)").run(JSON.stringify([loadQuestion]))
const insertRoster = seeded.prepare(`INSERT INTO exam_roster(id,exam_id,seq_number,name,username,password_hash,password_plain,qr_token,used,created_at,qr_expires_at)
  VALUES(?,'production-load-exam',?,?,?,?,?,?,0,'now',?)`)
const loadTokens = []
for (let i=1;i<=100;i++) { const token = ('load-token-' + String(i).padStart(3,'0') + '-').padEnd(44,'x'); loadTokens.push(token); insertRoster.run('load-r-'+i,i,'مرشح حمل '+i,'load-user-'+i,'','',token,new Date(Date.now()+86400000).toISOString()) }
seeded.close()

const child = spawn(process.execPath, ['server/index.js'], { cwd:project, windowsHide:true,
  env:{ ...process.env, NODE_ENV:'production', PORT:'0', APP_ORIGIN:'https://validation.example', PUBLIC_APP_URL:'https://validation.example', EXAM_DATA_DIR:data, JWT_SECRET:'production-validation-secret-32-characters-minimum', ARCHIVE_BACKUP_ENCRYPTION_KEY:'production-validation-backup-key-32-chars', ARCHIVE_BACKUP_DIR:path.join(temp,'backups'), ARCHIVE_BACKUP_MIRROR_DIR:path.join(temp,'mirror') },
  stdio:['ignore','pipe','pipe'] })
let output = ''
const base = await new Promise((resolve,reject) => {
  const timer = setTimeout(() => reject(new Error('انتهت مهلة تشغيل النسخة المعزولة\n' + output)), 30000)
  child.on('error', reject)
  const read = (chunk) => { output += String(chunk); const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]) } }
  child.stdout.on('data', read); child.stderr.on('data', read)
})
try {
  const live = await fetch(base + '/api/health/live'); if (!live.ok) throw new Error('فشل liveness')
  let ready
  for (let i=0;i<40;i++) { ready = await fetch(base + '/api/health/ready'); if (ready.ok) break; await new Promise((r) => setTimeout(r,250)) }
  if (!ready?.ok) throw new Error('فشل readiness: ' + await ready.text())
  const requests = await Promise.all(Array.from({length:100}, () => fetch(base + '/api/health/live')))
  if (requests.some((response) => !response.ok)) throw new Error('فشل اختبار 100 اتصال')
  const loadStarted = performance.now()
  const submissions = await Promise.all(loadTokens.map(async (token, index) => {
    const login = await fetch(base + '/api/auth/exam/qr-login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token,deviceId:'load-device-'+index}) })
    if (!login.ok) throw new Error('فشل دخول الحمل ' + login.status + ': ' + await login.text())
    const cookie = String(login.headers.get('set-cookie')).split(';')[0]
    const headers = {'Content-Type':'application/json',Cookie:cookie}
    const start = await fetch(base + '/api/exam/execution/start', {method:'POST',headers})
    const startBody = await start.json(); if (!start.ok) throw new Error('فشل بدء الحمل: ' + JSON.stringify(startBody))
    const progress = await fetch(base + '/api/exam/execution/progress', {method:'PUT',headers,body:JSON.stringify({answers:{'production-load-question':'a'},questionIndex:0,revision:startBody.run.revision})})
    const progressBody = await progress.json(); if (!progress.ok) throw new Error('فشل حفظ الحمل: ' + JSON.stringify(progressBody))
    const submit = await fetch(base + '/api/exam/submit', {method:'POST',headers,body:JSON.stringify({answers:{'production-load-question':'a'},submissionKey:'load-submit-'+index,revision:progressBody.revision})})
    if (!submit.ok) throw new Error('فشل تسليم الحمل: ' + await submit.text())
    return performance.now() - loadStarted
  }))
  output += '\nloadP95=' + submissions.sort((a,b)=>a-b)[94]
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve) => { child.once('exit', resolve); setTimeout(resolve, 16000) })
}
const migrated = new Database(targetPath, { readonly:true, fileMustExist:true })
const after = Object.fromEntries(tracked.map((table) => [table, migrated.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]))
const integrity = migrated.pragma('integrity_check', { simple:true })
const schemaVersion = migrated.prepare('SELECT MAX(version) AS n FROM schema_migrations').get().n
migrated.close()
const expected = { ...before, exams:before.exams+1, exam_roster:before.exam_roster+100, attempts:before.attempts+100, assessment_archive:before.assessment_archive+100, archive_versions:before.archive_versions+100 }
if (integrity !== 'ok' || schemaVersion < 6 || JSON.stringify(expected) !== JSON.stringify(after)) throw new Error('فشل تحقق البيانات بعد الترحيل والحمل: ' + JSON.stringify({integrity,schemaVersion,expected,after}))
console.log(JSON.stringify({ ok:true, sourcePath, schemaVersion, counts:after, concurrentHealthChecks:100, concurrentExamFlows:100, isolatedDirectory:temp }, null, 2))
