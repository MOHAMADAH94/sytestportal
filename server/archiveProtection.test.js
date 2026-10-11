import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { installArchiveProtection, retainDeletedExam } from './archiveProtection.js'
import { createArchiveBackups, verifyBackup, verifyEncryptedBackup, restoreBackup } from './archiveBackups.js'
import { createCommitteeService } from './committees.js'
import { createMonitoringStore } from './monitoring.js'
import { createEvaluationService } from './evaluationSessions.js'

const schema = readFileSync(new URL('./db.js', import.meta.url), 'utf8').match(/db\.exec\(`([\s\S]*?)`\)/)[1]
const admin = { role: 'admin', username: 'admin' }
function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close()); db.exec(schema)
  for (const c of ['display_id','org','job_title','rank']) db.exec('ALTER TABLE exam_roster ADD COLUMN ' + c + ' TEXT')
  db.prepare("INSERT INTO exams(id,title,category,level,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at) VALUES ('exam','عنوان محفوظ','oral','engineer',1,1,'exam','','','[]','[]','now')").run()
  db.prepare("INSERT INTO exam_roster(id,exam_id,seq_number,name,username,password_hash,password_plain,qr_token,created_at) VALUES ('candidate','exam',1,'متقدم','candidate','','','qr','now')").run()
  const committees = createCommitteeService(db), monitoring = createMonitoringStore(db)
  const evaluations = createEvaluationService(db, { committees, monitoring, jobExams: { isJobBased: () => true, questionsFor: () => [] }, assertExamAccess: () => true })
  installArchiveProtection(db)
  let session = evaluations.create(admin, 'exam', { name: 'متقدم', mode: 'manual' })
  session = evaluations.save(admin, session.id, { version: session.version, ready: true, questions: [{ text: 'سؤال محفوظ', status: 'approved', weight: 1 }] })
  session = evaluations.grade(admin, session.id, { version: session.version, grades: [{ id: session.questions[0].id, answer: 'إجابة محفوظة', grade: 8 }] })
  evaluations.publish(admin, session.id, { version: session.version })
  monitoring.record({ examId:'exam',rosterId:'candidate',examineeName:'متقدم',connected:true,monitoringStatus:'partial' }, 'page_hidden')
  return { db, evaluations, session }
}
test('deleting an exam hides and stops it while preserving archive, answers, session history and monitoring', (t) => {
  const { db, evaluations, session } = fixture(t)
  const tables = ['assessment_archive','archive_versions','attempts','exam_roster','evaluation_sessions','evaluation_session_audit','monitoring_events']
  const before = tables.map((table) => db.prepare('SELECT * FROM ' + table).all())
  assert.deepEqual(retainDeletedExam(db, 'exam', 'admin:test'), { ok: true, retained: true, deletedAttempts: 0 })
  assert.equal(db.prepare('SELECT id FROM exams WHERE deleted_at IS NULL').get(), undefined)
  assert.equal(db.prepare('SELECT active FROM exams').get().active, 0)
  for (const [i, table] of tables.entries()) assert.deepEqual(db.prepare('SELECT * FROM ' + table).all(), before[i])
  assert.equal(evaluations.view(admin, session.id).questions[0].answer, 'إجابة محفوظة')
  assert.ok(evaluations.history(admin, session.id).length >= 4)
  retainDeletedExam(db, 'exam', 'admin:retry')
  assert.equal(db.prepare('SELECT COUNT(*) n FROM exam_retention_log').get().n, 1)
  assert.throws(() => db.prepare('UPDATE exams SET active=1').run(), /retained/)
})
test('SQL delete and replacement cannot erase protected exam records', (t) => {
  const { db } = fixture(t)
  for (const table of ['assessment_archive','archive_versions','attempts','exam_roster','evaluation_sessions','evaluation_session_audit','monitoring_events','exams']) assert.throws(() => db.exec('DELETE FROM ' + table), /cannot be deleted/)
  const row = db.prepare('SELECT * FROM assessment_archive').get(), keys = Object.keys(row)
  assert.throws(() => db.prepare('INSERT OR REPLACE INTO assessment_archive (' + keys.join(',') + ') VALUES (' + keys.map(() => '?').join(',') + ')').run(...Object.values(row)), /cannot be deleted/)
})
test('result correction adds a retained snapshot while original content and prior versions are immutable', (t) => {
  const { db } = fixture(t)
  const original = db.prepare('SELECT snapshot_json FROM archive_versions').get().snapshot_json
  db.exec('UPDATE assessment_archive SET score=90,percent=90')
  const versions = db.prepare('SELECT snapshot_json FROM archive_versions ORDER BY id').all()
  assert.equal(versions[0].snapshot_json, original)
  assert.equal(JSON.parse(versions[1].snapshot_json).score, 90)
  assert.throws(() => db.exec("UPDATE assessment_archive SET detail_json='{}'"), /retained permanently/)
  assert.throws(() => db.exec("UPDATE archive_versions SET snapshot_json='{}'"), /cannot be changed/)
  installArchiveProtection(db)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM archive_versions').get().n, 2)
})
test('admin can correct a committee percent without rewriting the note or salary', (t) => {
  const { db } = fixture(t)
  db.prepare(`INSERT INTO committee_results(assignment_id, examinee_name, attempt_id, percent, snapshot_json, published_at, note, estimated_salary)
    VALUES ('assignment','متقدم','attempt',80,'{}','now','ملاحظة اللجنة',180000)`).run()
  db.prepare('UPDATE committee_results SET percent=70 WHERE assignment_id=?').run('assignment')
  const row = db.prepare('SELECT percent, note, estimated_salary AS estimatedSalary FROM committee_results').get()
  assert.equal(row.percent, 70)
  assert.equal(row.note, 'ملاحظة اللجنة')
  assert.equal(row.estimatedSalary, 180000)
  assert.throws(() => db.prepare("UPDATE committee_results SET note='تغيير'").run(), /cannot be changed/)
  assert.throws(() => db.prepare('DELETE FROM committee_results').run(), /cannot be deleted/)
})
test('existing archive baseline migration is idempotent and retains orphans of previously deleted exams', (t) => {
  const db = new Database(':memory:'); t.after(() => db.close()); db.exec(schema)
  db.prepare("INSERT INTO assessment_archive(id,category,exam_id,exam_title,examinee_name,score,max_score,detail_json,archived_at) VALUES ('old','oral','gone','اختبار سابق','متقدم',7,10,'{\"answer\":\"محفوظة\"}','2020')").run()
  installArchiveProtection(db); installArchiveProtection(db)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM archive_versions').get().n, 1)
  assert.equal(JSON.parse(db.prepare('SELECT snapshot_json FROM archive_versions').get().snapshot_json).exam_id, 'gone')
})
async function temp(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-protection-test-'))
  t.after(async () => {
    if (path.dirname(path.resolve(folder)) !== path.resolve(os.tmpdir()) || !path.basename(folder).startsWith('archive-protection-test-')) throw new Error('Unsafe cleanup path')
    await fs.rm(folder, { recursive: true, force: true })
  })
  return folder
}
test('verified backups can recover all retained records into a new database and never overwrite existing files', async (t) => {
  const folder = await temp(t), { db } = fixture(t), backups = createArchiveBackups(db, folder)
  const first = await backups.backup('test')
  retainDeletedExam(db, 'exam', 'admin:test')
  const second = await backups.backup('after-delete')
  assert.notEqual(first.file, second.file)
  const source = path.join(folder, second.file), restored = path.join(folder, 'restored.db')
  assert.equal((await verifyBackup(source)).archiveCount, 1)
  await restoreBackup(source, restored)
  const copy = new Database(restored, { readonly:true })
  assert.equal(copy.prepare('SELECT score FROM assessment_archive').get().score, 80)
  assert.ok(copy.prepare('SELECT deleted_at FROM exams').get().deleted_at)
  assert.equal(copy.prepare('SELECT COUNT(*) n FROM monitoring_events').get().n, 1)
  copy.close()
  await assert.rejects(restoreBackup(source, restored), /EEXIST/)
  assert.equal(backups.status().lastError, null)
  assert.equal(backups.status().busy, false)
})
test('tampered backups are rejected and no recovered target is created', async (t) => {
  const folder = await temp(t), { db } = fixture(t), backups = createArchiveBackups(db, folder)
  const manifest = await backups.backup('test'), file = path.join(folder, manifest.file), target = path.join(folder, 'invalid.db')
  await fs.appendFile(file, 'damage')
  await assert.rejects(restoreBackup(file, target), /غير مطابقة/)
  await assert.rejects(fs.stat(target), /ENOENT/)
})
test('a failed pre-delete backup prevents deletion and surfaces failure status', async (t) => {
  const folder = await temp(t), { db } = fixture(t), blocked = path.join(folder, 'not-a-directory')
  await fs.writeFile(blocked, 'occupied')
  const backups = createArchiveBackups(db, blocked)
  await assert.rejects(async () => { await backups.backup('before-exam-delete'); retainDeletedExam(db, 'exam', 'admin:test') })
  assert.equal(db.prepare('SELECT deleted_at FROM exams').get().deleted_at, null)
  assert.ok(backups.status().lastError)
})

test('automatic changed-data backups refresh both folders and retain previous verified snapshots', async (t) => {
  const folder = await temp(t), { db } = fixture(t)
  const mirror = path.join(folder, 'desktop-copy'), primary = path.join(folder, 'primary')
  t.mock.timers.enable({ apis: ['setInterval'] })
  const backups = createArchiveBackups(db, primary, { mirrorDirectory: mirror })
  backups.start()
  await backups.backup('barrier')
  db.exec('UPDATE assessment_archive SET score=91,percent=91')
  t.mock.timers.tick(60000)
  await backups.backup('barrier')
  backups.stop()
  const names = (await fs.readdir(primary)).filter((name) => name.endsWith('.db'))
  const manifests = await Promise.all(names.map((name) => verifyBackup(path.join(primary, name))))
  assert.ok(manifests.some((m) => m.reason === 'automatic'))
  assert.ok(manifests.some((m) => m.reason === 'startup'))
  for (const name of names) assert.equal((await verifyBackup(path.join(mirror, name))).sha256, (await verifyBackup(path.join(primary, name))).sha256)
})

test('external backups can be encrypted and restored with integrity verification', async (t) => {
  const folder = await temp(t), primary = path.join(folder, 'primary'), mirror = path.join(folder, 'offsite')
  const { db } = fixture(t), secret = 'test-backup-encryption-key-at-least-32'
  const backups = createArchiveBackups(db, primary, { mirrorDirectory:mirror, encryptionKey:secret })
  const manifest = await backups.backup('manual')
  const encrypted = path.join(mirror, manifest.file + '.enc')
  await verifyEncryptedBackup(encrypted, secret)
  assert.rejects(() => verifyEncryptedBackup(encrypted, 'wrong-key-that-is-still-at-least-32-characters'))
  assert.equal((await fs.readdir(mirror)).some((name) => name.includes('.verify-')), false)
  const target = path.join(folder, 'restored.db')
  const previous = process.env.ARCHIVE_BACKUP_ENCRYPTION_KEY; process.env.ARCHIVE_BACKUP_ENCRYPTION_KEY = secret
  try { await restoreBackup(encrypted, target) } finally { if (previous == null) delete process.env.ARCHIVE_BACKUP_ENCRYPTION_KEY; else process.env.ARCHIVE_BACKUP_ENCRYPTION_KEY = previous }
  const restored = new Database(target, { readonly:true })
  try { assert.equal(restored.pragma('integrity_check', { simple:true }), 'ok') } finally { restored.close() }
})

test('real API retains archive and audit after deletion, and archive failure rolls back legacy publication', { timeout: 60000 }, async (t) => {
  const folder = await temp(t), data = path.join(folder, 'data')
  await fs.mkdir(data)
  const seed = new Database(path.join(data, 'exams.db')); seed.exec(schema)
  seed.prepare("INSERT INTO exams(id,title,category,level,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at) VALUES ('retention-test','اختبار الحماية','driving','engineer',5,1,'retention-test','','','[]','[]','now')").run()
  seed.close()
  const child = spawn(process.execPath, ['server/index.js'], { cwd: new URL('../', import.meta.url), windowsHide: true,
    env: { ...process.env, PORT: '0', EXAM_DATA_DIR: data, INITIAL_ADMIN_PASSWORD: 'K7k-KP7U*YsCyrd_XcTE', ARCHIVE_BACKUP_DIR: path.join(folder, 'backups'), ARCHIVE_BACKUP_MIRROR_DIR: path.join(folder, 'desktop') }, stdio: ['ignore','pipe','pipe'] })
  let database
  try {
    const base = await new Promise((resolve, reject) => {
      let output = ''
      const timer = setTimeout(() => reject(new Error('Server startup timeout: ' + output)), 25000)
      child.on('error', (e) => { clearTimeout(timer); reject(e) })
      child.stdout.on('data', (chunk) => { output += String(chunk); const found = output.match(/http:\/\/localhost:(\d+)/); if (found) { clearTimeout(timer); resolve('http://localhost:' + found[1]) } })
      child.stderr.on('data', (chunk) => { output += String(chunk) })
    })
    let token
    async function request(url, method = 'GET', body) {
      const response = await fetch(base + '/api' + url, { method, headers: { 'Content-Type':'application/json', ...(token ? { Authorization:'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
      return { status: response.status, headers: response.headers, data: await response.json() }
    }
    const login = await request('/auth/admin/login', 'POST', { username:'admin', password:'K7k-KP7U*YsCyrd_XcTE' })
    token = login.data.token
    assert.ok(token)
    assert.match(login.headers.get('set-cookie'), /Max-Age=2592000/)
    assert.equal(login.data.mustRotatePassword, false)
    assert.equal((await request('/admin/exams')).status, 200, 'الحساب الأولي يستطيع المتابعة دون تغيير إجباري')
    const protectedAdminPassword = await request('/auth/change-password', 'POST', { currentPassword:'K7k-KP7U*YsCyrd_XcTE', newPassword:'Changed*Password2026' })
    assert.equal(protectedAdminPassword.status, 403)
    const accounts = await request('/admin/password-accounts')
    assert.equal(accounts.status, 200)
    assert.equal(accounts.data.find((account) => account.username === 'admin').canReset, false)
    const operator = accounts.data.find((account) => account.type === 'operator')
    const reset = await request(`/admin/password-accounts/operator/${operator.id}/reset`, 'POST', { newPassword:'Reset*Operator2026', reason:'اختبار استعادة الحساب المنسية' })
    assert.equal(reset.status, 200, JSON.stringify(reset.data))
    const passwordHistory = await request('/admin/password-history')
    assert.equal(passwordHistory.data.history[0].action, 'admin_reset')
    const created = await request('/admin/exams/retention-test/manual-score', 'POST', { examineeName:'متقدم محفوظ', score:85, maxScore:100 })
    assert.equal(created.status, 201, JSON.stringify(created.data))
    assert.equal((await request('/admin/attempts/' + created.data.attempt.id + '/modify-result', 'POST', { newPercent:90, reason:'تصحيح معتمد للاختبار' })).status, 200)
    database = new Database(path.join(data, 'exams.db'))
    database.exec("CREATE TRIGGER test_archive_failure BEFORE INSERT ON assessment_archive BEGIN SELECT RAISE(ABORT,'test archive unavailable'); END")
    const failed = await request('/admin/exams/retention-test/manual-score', 'POST', { examineeName:'لا تحفظ جزئيا', score:75, maxScore:100 })
    assert.equal(failed.status, 500)
    assert.equal(database.prepare("SELECT id FROM attempts WHERE examinee_name='لا تحفظ جزئيا'").get(), undefined)
    database.exec('DROP TRIGGER test_archive_failure')
    const removed = await request('/admin/exams/retention-test', 'DELETE')
    assert.equal(removed.status, 200, JSON.stringify(removed.data))
    assert.equal(removed.data.deletedAttempts, 0)
    const archive = await request('/admin/assessment-archive?examId=retention-test')
    assert.equal(archive.data.archive.length, 1)
    const versions = await request('/admin/assessment-archive/' + archive.data.archive[0].id + '/versions')
    assert.deepEqual(versions.data.map((v) => v.score), [85,90])
    const audit = await request('/admin/attempts/' + created.data.attempt.id + '/audit-history')
    assert.equal(audit.data.total, 1)
    assert.equal((await request('/admin/exams/retention-test/active','PATCH',{ active:true })).status, 409)
    assert.equal(database.prepare('SELECT COUNT(*) n FROM attempts').get().n, 1)
    assert.equal((await request('/admin/archive-protection')).data.externalCopyConfigured, true)
    database.prepare("INSERT INTO applicants(id,seq_number,name,job_title,created_at,updated_at) VALUES ('future',1,'مرشح جديد','منسق استدامة','now','now')").run()
    const pending = await request('/admin/exams','POST',{ title:'اختبار تخصص جديد',category:'theory',applicantIds:['future'],groups:[{ key:'منسق استدامة',profileId:'unclassified',specialty:'unclassified',jobLevel:'intermediate',difficulty:'medium',questionCount:20,includeShared:false }] })
    assert.equal(pending.status,201,JSON.stringify(pending.data)); assert.equal(pending.data.pendingQuestions,true)
    const prefix = '/admin/exams/' + pending.data.id
    assert.equal((await request(prefix + '/active','PATCH',{ active:true })).status,409)
    assert.equal((await request(prefix + '/manual-score','POST',{ examineeName:'مرشح جديد',score:100 })).status,409)
    assert.equal((await request(prefix + '/pending-questions')).data.groups.length,1)
    const completed = await request(prefix + '/pending-questions','POST',{ key:'منسق استدامة',source:'manual',questions:[{ text:'كيف توثق نتائج مهمة خاصة بعملك؟',answerKey:'النتيجة والمصدر والوقت والمسؤول والملاحظات',points:5 }] })
    assert.equal(completed.status,200,JSON.stringify(completed.data)); assert.equal(completed.data.ready,true)
    assert.equal((await request(prefix + '/active','PATCH',{ active:true })).status,200)
  } finally {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited }
    database?.close()
  }
})
