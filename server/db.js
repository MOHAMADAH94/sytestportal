import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'url'
import { ACCESS_ACCOUNTS } from './accessAccounts.js'
import { RETIRED_ACCESS_USERNAMES } from '../shared/committeeCatalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const dataDir = process.env.EXAM_DATA_DIR || path.join(__dirname, 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

export const dbPath = path.join(dataDir, 'exams.db')
export const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    auth_version INTEGER NOT NULL DEFAULT 1,
    must_rotate_password INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS access_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_plain TEXT NOT NULL,
    label TEXT NOT NULL,
    category TEXT NOT NULL,
    oral_role TEXT,
    description TEXT,
    created_at TEXT NOT NULL,
    auth_version INTEGER NOT NULL DEFAULT 1,
    must_rotate_password INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    specialization TEXT
  );

  CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    level TEXT NOT NULL,
    oral_role TEXT,
    capacity INTEGER NOT NULL,
    question_count INTEGER NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_plain TEXT NOT NULL,
    question_ids TEXT NOT NULL,
    questions_json TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL,
    examinee_name TEXT NOT NULL,
    applicant_id TEXT,
    roster_id TEXT,
    run_id TEXT,
    submission_key TEXT,
    answers_json TEXT NOT NULL,
    score REAL,
    max_score REAL,
    personality_json TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    evaluation_status TEXT DEFAULT 'completed',
    question_evaluations_json TEXT,
    client_ip TEXT,
    FOREIGN KEY (exam_id) REFERENCES exams(id)
  );

  CREATE TABLE IF NOT EXISTS exam_roster (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL,
    seq_number INTEGER NOT NULL,
    applicant_id TEXT,
    name TEXT NOT NULL,
    extra_json TEXT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_plain TEXT NOT NULL,
    qr_token TEXT UNIQUE NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (exam_id) REFERENCES exams(id)
  );

  CREATE INDEX IF NOT EXISTS idx_roster_exam ON exam_roster(exam_id);
  CREATE INDEX IF NOT EXISTS idx_roster_qr ON exam_roster(qr_token);

  CREATE TABLE IF NOT EXISTS examinee_profiles (
    name TEXT PRIMARY KEY,
    org TEXT,
    job_title TEXT,
    rank TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS applicants (
    id TEXT PRIMARY KEY,
    seq_number INTEGER NOT NULL,
    display_id TEXT UNIQUE,
    name TEXT NOT NULL,
    org TEXT,
    job_title TEXT,
    rank TEXT,
    job_title_org TEXT,
    job_title_committee TEXT,
    proposed_salary REAL,
    rank_committee TEXT,
    approved_salary REAL,
    education_committee TEXT,
    extra_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_applicants_seq ON applicants(seq_number);
  CREATE INDEX IF NOT EXISTS idx_applicants_name ON applicants(name);

  CREATE TABLE IF NOT EXISTS applicant_columns (
    label TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS oral_archive (
    id            TEXT PRIMARY KEY,
    exam_id       TEXT NOT NULL,
    exam_title    TEXT NOT NULL,
    oral_role     TEXT,
    examinee_name TEXT NOT NULL,
    job_title     TEXT,
    score         REAL NOT NULL,
    max_score     REAL NOT NULL,
    percent       REAL,
    questions_json TEXT NOT NULL,
    archived_at   TEXT NOT NULL,
    evaluator     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_oral_archive_exam ON oral_archive(exam_id);
  CREATE INDEX IF NOT EXISTS idx_oral_archive_date ON oral_archive(archived_at);
  CREATE INDEX IF NOT EXISTS idx_oral_archive_name ON oral_archive(examinee_name);

  CREATE TABLE IF NOT EXISTS assessment_archive (
    id            TEXT PRIMARY KEY,
    applicant_id  TEXT,
    attempt_id    TEXT,
    category      TEXT NOT NULL,
    exam_id       TEXT,
    exam_title    TEXT NOT NULL,
    oral_role     TEXT,
    examinee_name TEXT NOT NULL,
    display_id    TEXT,
    org           TEXT,
    job_title     TEXT,
    rank          TEXT,
    score         REAL NOT NULL,
    max_score     REAL NOT NULL,
    percent       REAL,
    detail_json   TEXT NOT NULL DEFAULT '{}',
    archived_at   TEXT NOT NULL,
    evaluator     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_aa_category ON assessment_archive(category);
  CREATE INDEX IF NOT EXISTS idx_aa_date ON assessment_archive(archived_at);
  CREATE INDEX IF NOT EXISTS idx_aa_name ON assessment_archive(examinee_name);

  CREATE TABLE IF NOT EXISTS result_audit_log (
    id                  TEXT PRIMARY KEY,
    attempt_id          TEXT NOT NULL,
    exam_id             TEXT NOT NULL,
    exam_title          TEXT NOT NULL,
    category            TEXT NOT NULL,
    examinee_name       TEXT NOT NULL,
    display_id          TEXT,
    original_score      REAL NOT NULL,
    original_max_score  REAL NOT NULL,
    original_percent    REAL,
    new_score           REAL NOT NULL,
    new_max_score       REAL NOT NULL,
    new_percent         REAL,
    diff_percent        REAL,
    reason              TEXT NOT NULL,
    committee_reference TEXT,
    modified_by_id      TEXT,
    modified_by_name    TEXT NOT NULL,
    modified_by_role    TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    FOREIGN KEY (attempt_id) REFERENCES attempts(id),
    FOREIGN KEY (exam_id) REFERENCES exams(id)
  );
  CREATE INDEX IF NOT EXISTS idx_ral_attempt ON result_audit_log(attempt_id);
  CREATE INDEX IF NOT EXISTS idx_ral_examinee ON result_audit_log(examinee_name);
  CREATE INDEX IF NOT EXISTS idx_ral_date ON result_audit_log(created_at);

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    request_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    before_hash TEXT,
    after_hash TEXT,
    reason TEXT,
    occurred_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_events_date ON audit_events(occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type,resource_id,occurred_at DESC);
  CREATE TRIGGER IF NOT EXISTS audit_events_no_update BEFORE UPDATE ON audit_events
  BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS audit_events_no_delete BEFORE DELETE ON audit_events
  BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;

  CREATE TABLE IF NOT EXISTS decision_adoptions (
    id TEXT PRIMARY KEY,
    applicant_id TEXT NOT NULL,
    examinee_name TEXT,
    recommended_status TEXT NOT NULL,
    adopted_status TEXT NOT NULL,
    reason TEXT,
    policy_version TEXT NOT NULL,
    thresholds_json TEXT NOT NULL,
    weights_json TEXT NOT NULL,
    category_percents_json TEXT NOT NULL,
    composite_percent REAL,
    pending_json TEXT,
    missing_json TEXT,
    evaluators_json TEXT,
    adopted_by_id TEXT,
    adopted_by_name TEXT NOT NULL,
    adopted_by_role TEXT NOT NULL,
    adopted_at TEXT NOT NULL,
    superseded_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_decision_adoptions_applicant ON decision_adoptions(applicant_id, superseded_at, adopted_at);

  CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)')

function ensureColumn(table, name, definition) {
  const columns = new Set(db.prepare('PRAGMA table_info(' + table + ')').all().map((column) => column.name))
  if (!columns.has(name)) db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + name + ' ' + definition)
  if (!db.prepare('PRAGMA table_info(' + table + ')').all().some((column) => column.name === name)) {
    throw new Error('فشل ترحيل قاعدة البيانات: ' + table + '.' + name)
  }
}

function migration(version, name, run) {
  if (db.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version)) return
  db.transaction(() => {
    run()
    db.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES (?,?,?)')
      .run(version, name, new Date().toISOString())
  })()
}

migration(1, 'production-hardening-columns', () => {
  ensureColumn('admins', 'auth_version', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('admins', 'must_rotate_password', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn('access_accounts', 'auth_version', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('access_accounts', 'must_rotate_password', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn('exam_roster', 'applicant_id', 'TEXT')
  ensureColumn('exam_roster', 'qr_claimed_at', 'TEXT')
  ensureColumn('exam_roster', 'qr_expires_at', 'TEXT')
  ensureColumn('exam_roster', 'qr_session_id', 'TEXT')
  ensureColumn('exam_roster', 'qr_device_id', 'TEXT')
  ensureColumn('attempts', 'applicant_id', 'TEXT')
  ensureColumn('attempts', 'roster_id', 'TEXT')
  ensureColumn('attempts', 'run_id', 'TEXT')
  ensureColumn('attempts', 'submission_key', 'TEXT')
  ensureColumn('assessment_archive', 'applicant_id', 'TEXT')
  ensureColumn('assessment_archive', 'attempt_id', 'TEXT')
  ensureColumn('applicants', 'job_title_org', 'TEXT')
  ensureColumn('applicants', 'job_title_committee', 'TEXT')
  ensureColumn('applicants', 'proposed_salary', 'REAL')
  ensureColumn('applicants', 'rank_committee', 'TEXT')
  ensureColumn('applicants', 'approved_salary', 'REAL')
  ensureColumn('applicants', 'education_committee', 'TEXT')
})

migration(2, 'production-hardening-indexes', () => {
  db.exec('CREATE INDEX IF NOT EXISTS idx_attempts_exam_candidate_date ON attempts(exam_id, applicant_id, examinee_name, finished_at DESC);' +
    'CREATE INDEX IF NOT EXISTS idx_attempts_roster ON attempts(roster_id);' +
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_run_unique ON attempts(run_id) WHERE run_id IS NOT NULL;' +
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_submission_unique ON attempts(submission_key) WHERE submission_key IS NOT NULL;' +
    'CREATE INDEX IF NOT EXISTS idx_archive_attempt ON assessment_archive(attempt_id);' +
    'CREATE INDEX IF NOT EXISTS idx_archive_applicant_category_date ON assessment_archive(applicant_id, category, archived_at DESC);' +
    'CREATE INDEX IF NOT EXISTS idx_roster_applicant ON exam_roster(applicant_id);')
})

migration(3, 'force-rotation-of-legacy-source-passwords', () => {
  db.prepare('UPDATE admins SET must_rotate_password=1, auth_version=auth_version+1').run()
  db.prepare('UPDATE access_accounts SET must_rotate_password=1, auth_version=auth_version+1').run()
})

migration(4, 'stable-applicant-identity', () => {
  const uniqueNameIndex = db.prepare("PRAGMA index_list('applicants')").all().find((index) => {
    if (!index.unique) return false
    const columns = db.prepare('PRAGMA index_info(' + JSON.stringify(index.name) + ')').all()
    return columns.length === 1 && columns[0].name === 'name'
  })
  if (!uniqueNameIndex) return
  db.exec("CREATE TABLE applicants_identity_new (id TEXT PRIMARY KEY,seq_number INTEGER NOT NULL,display_id TEXT UNIQUE,name TEXT NOT NULL,org TEXT,job_title TEXT,rank TEXT,job_title_org TEXT,job_title_committee TEXT,proposed_salary REAL,rank_committee TEXT,approved_salary REAL,education_committee TEXT,extra_json TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);" +
    "INSERT INTO applicants_identity_new SELECT id,seq_number,display_id,name,org,job_title,rank,job_title_org,job_title_committee,proposed_salary,rank_committee,approved_salary,education_committee,extra_json,created_at,updated_at FROM applicants;" +
    "DROP TABLE applicants;ALTER TABLE applicants_identity_new RENAME TO applicants;" +
    "CREATE INDEX idx_applicants_seq ON applicants(seq_number);CREATE INDEX idx_applicants_name ON applicants(name);")
})

migration(5, 'verified-legacy-columns', () => {
  ensureColumn('exam_roster', 'display_id', 'TEXT')
  ensureColumn('exam_roster', 'org', 'TEXT')
  ensureColumn('exam_roster', 'job_title', 'TEXT')
  ensureColumn('exam_roster', 'rank', 'TEXT')
  ensureColumn('exams', 'created_by', 'TEXT')
  ensureColumn('access_accounts', 'theory_track', 'TEXT')
  ensureColumn('applicants', 'job_title_org', 'TEXT')
  ensureColumn('applicants', 'job_title_committee', 'TEXT')
  ensureColumn('applicants', 'proposed_salary', 'REAL')
  ensureColumn('applicants', 'rank_committee', 'TEXT')
  ensureColumn('applicants', 'approved_salary', 'REAL')
  ensureColumn('applicants', 'education_committee', 'TEXT')
})

const generatedCredentials = []
function initialPassword(username) {
  const envName = 'INITIAL_' + username.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_PASSWORD'
  const configured = process.env[envName]
  if (configured) {
    if (configured.length < 14) throw new Error(envName + ' يجب ألا يقل عن 14 محرفًا')
    return configured
  }
  return crypto.randomBytes(18).toString('base64url') + '!7a'
}

function ensureInitialAdmin(username) {
  if (db.prepare('SELECT id FROM admins WHERE username=?').get(username)) return
  const password = initialPassword(username)
  db.prepare('INSERT INTO admins (username,password_hash,created_at,must_rotate_password) VALUES (?,?,?,0)')
    .run(username, bcrypt.hashSync(password, 12), new Date().toISOString())
  generatedCredentials.push({ username, password })
}

ensureInitialAdmin('admin')
ensureInitialAdmin('commander')

const insertAccess = db.prepare(`
  INSERT OR IGNORE INTO access_accounts
  (username, password_hash, password_plain, label, category, oral_role, theory_track, description, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateAccess = db.prepare(`
  UPDATE access_accounts
  SET label = ?, category = ?, oral_role = ?, theory_track = ?, description = ?
  WHERE username = ?
`)

for (const acc of ACCESS_ACCOUNTS) {
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT id FROM access_accounts WHERE username=?').get(acc.username)
  if (existing) {
    updateAccess.run(
      acc.label,
      acc.category,
      acc.oralRole || null,
      acc.theoryTrack || null,
      acc.description,
      acc.username,
    )
  } else {
    const password = initialPassword(acc.username)
    insertAccess.run(
      acc.username,
      bcrypt.hashSync(password, 12),
      '',
      acc.label,
      acc.category,
      acc.oralRole || null,
      acc.theoryTrack || null,
      acc.description,
      now,
    )
    generatedCredentials.push({ username: acc.username, password })
  }
}

if (generatedCredentials.length) {
  const preferredPath = path.join(dataDir, 'initial-credentials.txt')
  const credentialsPath = fs.existsSync(preferredPath)
    ? path.join(dataDir, 'initial-credentials-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt')
    : preferredPath
  const lines = [
    'بيانات الدخول الأولية — يمكن تغيير كلمة المرور من داخل الحساب',
    'أنشئت: ' + new Date().toISOString(),
    '',
    ...generatedCredentials.map((item) => item.username + ': ' + item.password),
    '',
    'احذف هذا الملف بعد تغيير جميع كلمات المرور.',
  ]
  fs.writeFileSync(credentialsPath, lines.join('\n'), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  console.log('✓ حُفظت بيانات الدخول الأولية مرة واحدة في ' + credentialsPath)
}

// كلمات مرور حسابات الوصول لا تُحفظ في قاعدة البيانات كنص صريح.
db.prepare("UPDATE access_accounts SET password_plain = '' WHERE password_plain <> ''").run()

const retireAccessAccount = db.prepare('DELETE FROM access_accounts WHERE lower(username) = lower(?)')
for (const username of RETIRED_ACCESS_USERNAMES) {
  const removed = retireAccessAccount.run(username)
  if (removed.changes) console.log(`✓ حُذف حساب بلا عمل: ${username}`)
}

console.log(`✓ حسابات الوصول: ${ACCESS_ACCOUNTS.length} حساباً جاهزة`)

// ترحيل مرقّم؛ أي فشل حقيقي يوقف الإقلاع بدل تشغيل مخطط جزئي.
migration(6, 'oral-archive-baseline', () => {
  db.exec(`
    INSERT OR IGNORE INTO assessment_archive
      (id, category, exam_id, exam_title, oral_role, examinee_name, job_title,
       score, max_score, percent, detail_json, archived_at, evaluator)
    SELECT id, 'oral', exam_id, exam_title, oral_role, examinee_name, job_title,
           score, max_score, percent,
           json_object('questions', json(questions_json)),
           archived_at, evaluator
    FROM oral_archive
  `)
})

// تغيير كلمة المرور ميزة اختيارية؛ نلغي أي علامة إلزام محفوظة من الإصدارات السابقة.
migration(7, 'optional-password-change', () => {
  db.prepare('UPDATE admins SET must_rotate_password=0').run()
  db.prepare('UPDATE access_accounts SET must_rotate_password=0').run()
})

migration(8, 'password-change-audit', () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_change_log (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_username TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      actor_username TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      request_id TEXT,
      changed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_password_change_log_date ON password_change_log(changed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_password_change_log_target ON password_change_log(target_type,target_id,changed_at DESC);
    CREATE TRIGGER IF NOT EXISTS password_change_log_no_update BEFORE UPDATE ON password_change_log
      BEGIN SELECT RAISE(ABORT, 'password change audit is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS password_change_log_no_delete BEFORE DELETE ON password_change_log
      BEGIN SELECT RAISE(ABORT, 'password change audit is immutable'); END;
  `)
})

migration(9, 'account-active-and-specialization', () => {
  ensureColumn('admins', 'active', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('access_accounts', 'active', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('access_accounts', 'specialization', 'TEXT')
})

migration(10, 'ip-tracking-columns', () => {
  ensureColumn('attempts', 'client_ip', 'TEXT')
  ensureColumn('audit_events', 'ip_address', 'TEXT')
  ensureColumn('password_change_log', 'ip_address', 'TEXT')
})

migration(11, 'classic-questions-and-evaluations', () => {
  ensureColumn('attempts', 'evaluation_status', "TEXT NOT NULL DEFAULT 'completed'")
  ensureColumn('attempts', 'question_evaluations_json', 'TEXT')
})

export function countAttempts(examId) {
  return db.prepare('SELECT COUNT(*) AS c FROM attempts WHERE exam_id = ?').get(examId).c
}

export function listAccessAccountsPublic() {
  return db
    .prepare(
      `SELECT id, username, label, category, oral_role AS oralRole,
              theory_track AS theoryTrack, specialization, description,
              COALESCE(active, 1) AS active
       FROM access_accounts ORDER BY id`,
    )
    .all()
}

