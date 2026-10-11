// Retained exam records are never physically deleted through application SQL.
export function installArchiveProtection(db) {
  if (!db.prepare('PRAGMA table_info(exams)').all().some((c) => c.name === 'deleted_at')) db.exec('ALTER TABLE exams ADD COLUMN deleted_at TEXT')
  db.pragma('recursive_triggers = ON')
  db.pragma('synchronous = FULL')
  db.exec(`CREATE TABLE IF NOT EXISTS archive_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, archive_id TEXT NOT NULL, recorded_at TEXT NOT NULL,
    operation TEXT NOT NULL, snapshot_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_archive_versions_record ON archive_versions(archive_id,id);
  CREATE TABLE IF NOT EXISTS exam_retention_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id TEXT NOT NULL, exam_title TEXT NOT NULL,
    deleted_at TEXT NOT NULL, actor TEXT NOT NULL
  );`)
  const columns = db.prepare('PRAGMA table_info(assessment_archive)').all().map((c) => c.name)
  const snapshot = (prefix) => 'json_object(' + columns.flatMap((c) => ["'" + c + "'", prefix + '.' + c]).join(',') + ')'
  db.transaction(() => {
    db.exec(`INSERT INTO archive_versions(archive_id,recorded_at,operation,snapshot_json)
      SELECT a.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'baseline',${snapshot('a')}
      FROM assessment_archive a WHERE NOT EXISTS (SELECT 1 FROM archive_versions v WHERE v.archive_id=a.id);
      CREATE TRIGGER IF NOT EXISTS archive_capture_insert AFTER INSERT ON assessment_archive BEGIN
        INSERT INTO archive_versions(archive_id,recorded_at,operation,snapshot_json)
        VALUES(NEW.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'insert',${snapshot('NEW')}); END;
      CREATE TRIGGER IF NOT EXISTS archive_capture_update AFTER UPDATE ON assessment_archive BEGIN
        INSERT INTO archive_versions(archive_id,recorded_at,operation,snapshot_json)
        VALUES(NEW.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'result_correction',${snapshot('NEW')}); END;
      CREATE TRIGGER IF NOT EXISTS archive_keep_content BEFORE UPDATE ON assessment_archive
      WHEN ${columns.filter((c) => !['score','max_score','percent'].includes(c)).map((c) => 'NEW.' + c + ' IS NOT OLD.' + c).join(' OR ')}
      BEGIN SELECT RAISE(ABORT,'Archive content is retained permanently'); END;
      CREATE TRIGGER IF NOT EXISTS retained_exam_cannot_reactivate BEFORE UPDATE ON exams
      WHEN OLD.deleted_at IS NOT NULL AND (NEW.deleted_at IS NOT OLD.deleted_at OR NEW.active != 0)
      BEGIN SELECT RAISE(ABORT,'Deleted exam is retained for archive access only'); END;`)
    const retained = ['assessment_archive','oral_archive','archive_versions','exam_retention_log','result_audit_log','exams','attempts','exam_roster','evaluation_sessions','evaluation_session_audit','evaluation_runs','monitoring_events','committee_results','exam_question_sets','job_exam_configs']
    for (const table of retained) {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue
      db.exec(`CREATE TRIGGER IF NOT EXISTS retain_${table}_delete BEFORE DELETE ON ${table}
        BEGIN SELECT RAISE(ABORT,'Historical exam records cannot be deleted'); END;`)
    }
    for (const table of ['oral_archive','archive_versions','exam_retention_log','result_audit_log','evaluation_session_audit','monitoring_events']) {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue
      db.exec(`CREATE TRIGGER IF NOT EXISTS retain_${table}_update BEFORE UPDATE ON ${table}
        BEGIN SELECT RAISE(ABORT,'Historical audit records cannot be changed'); END;`)
    }
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='committee_results'").get()) {
      db.exec(`DROP TRIGGER IF EXISTS retain_committee_results_update;
        CREATE TRIGGER retain_committee_results_update BEFORE UPDATE ON committee_results
        WHEN NEW.assignment_id IS NOT OLD.assignment_id
          OR NEW.examinee_name IS NOT OLD.examinee_name
          OR NEW.attempt_id IS NOT OLD.attempt_id
          OR NEW.snapshot_json IS NOT OLD.snapshot_json
          OR NEW.published_at IS NOT OLD.published_at
          OR IFNULL(NEW.note, '') IS NOT IFNULL(OLD.note, '')
          OR IFNULL(NEW.estimated_salary, -1) IS NOT IFNULL(OLD.estimated_salary, -1)
        BEGIN SELECT RAISE(ABORT,'Historical audit records cannot be changed'); END;`)
    }
  })()
}

export function retainDeletedExam(db, examId, actor) {
  return db.transaction(() => {
    const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(examId)
    if (!exam) throw new Error('الاختبار غير موجود')
    if (!exam.deleted_at) {
      const at = new Date().toISOString()
      db.prepare('UPDATE exams SET active=0,deleted_at=? WHERE id=?').run(at, examId)
      db.prepare('INSERT INTO exam_retention_log(exam_id,exam_title,deleted_at,actor) VALUES (?,?,?,?)').run(examId, exam.title, at, actor)
    }
    return { ok: true, retained: true, deletedAttempts: 0 }
  })()
}
