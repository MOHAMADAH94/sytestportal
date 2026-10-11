import { db } from './db.js'

/** استخراج الجهة / المسمى / الرتبة من أعمدة Excel */
export function pickRosterMeta(extra = {}) {
  const entries = Object.entries(extra || {})
  const committeeExclusions = [
    'المسمى الوارد من الجهة',
    'المسمى المقترح من اللجنة',
    'مسمى العمل المقترح من الجهة',
    'مسمى العمل طلب الاحتياج',
    'مسمى المرفوع',
    'الراتب المقترح',
    'الرتبة المقترحة من اللجنة',
    'الراتب المقرر من مدير الإدارة',
    'التحصيل العلمي من اللجنة',
    'مسمى عمل - اللجنة',
    'مسمى عمل  - اللجنة',
    'التأهيل العلمي مع الاختصاص',
    'راتب مقترح من الجهة',
  ]

  const find = (keys) => {
    for (const [k, v] of entries) {
      const nk = String(k)
        .trim()
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
      if (committeeExclusions.some((ce) => nk === ce || nk.includes(ce))) {
        continue
      }
      if (keys.some((key) => {
        const nk2 = String(key).trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ')
        return nk === nk2 || nk.includes(nk2)
      })) {
        const val = String(v || '').trim()
        if (val) return { key: k, value: val }
      }
    }
    return null
  }

  const orgHit = find([
    'السوية_التنظيمية الأولى',
    'السوية التنظيمية الأولى',
    'السوية التنظيمية',
    'السوية',
    'الجهة المرشحة',
    'الجهة',
    'جهة',
    'الوحدة',
    'وحدة',
    'org',
    'organization',
    'unit',
    'department',
  ])
  const jobHit = find([
    'مسمى العمل',
    'المسمى الوظيفي',
    'المسمى',
    'مسمى',
    'الوظيفة',
    'وظيفة',
    'job',
    'title',
    'position',
  ])
  const rankHit = find([
    'الرتبة',
    'رتبة',
    'rank',
    'grade',
  ])

  const rest = { ...extra }
  if (orgHit) delete rest[orgHit.key]
  if (jobHit) delete rest[jobHit.key]
  if (rankHit) delete rest[rankHit.key]

  return {
    org: orgHit?.value || '',
    jobTitle: jobHit?.value || '',
    rank: rankHit?.value || '',
    extra: rest,
  }
}

export function upsertExamineeProfile(name, { org, jobTitle, rank } = {}) {
  const clean = String(name || '').trim()
  if (!clean) return

  const existing = db.prepare('SELECT * FROM examinee_profiles WHERE name = ?').get(clean)
  const now = new Date().toISOString()

  if (!existing) {
    db.prepare(
      `INSERT INTO examinee_profiles (name, org, job_title, rank, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(clean, org || null, jobTitle || null, rank || null, now)
    return
  }

  db.prepare(
    `UPDATE examinee_profiles
     SET org = COALESCE(NULLIF(?, ''), org),
         job_title = COALESCE(NULLIF(?, ''), job_title),
         rank = COALESCE(NULLIF(?, ''), rank),
         updated_at = ?
     WHERE name = ?`,
  ).run(org || '', jobTitle || '', rank || '', now, clean)
}

export function getExamineeProfile(name) {
  return db.prepare('SELECT * FROM examinee_profiles WHERE name = ?').get(String(name || '').trim())
}

export function listOrgsAndJobs() {
  const orgs = db
    .prepare(
      `SELECT DISTINCT org FROM examinee_profiles WHERE org IS NOT NULL AND org != '' ORDER BY org`,
    )
    .all()
    .map((r) => r.org)
  const jobs = db
    .prepare(
      `SELECT DISTINCT job_title FROM examinee_profiles WHERE job_title IS NOT NULL AND job_title != '' ORDER BY job_title`,
    )
    .all()
    .map((r) => r.job_title)
  return { orgs, jobs }
}

export function setExamineeRank(name, rank) {
  const clean = String(name || '').trim()
  if (!clean) return null
  const now = new Date().toISOString()
  const existing = getExamineeProfile(clean)
  if (!existing) {
    db.prepare(
      `INSERT INTO examinee_profiles (name, org, job_title, rank, updated_at) VALUES (?, NULL, NULL, ?, ?)`,
    ).run(clean, String(rank || '').trim() || null, now)
  } else {
    db.prepare(`UPDATE examinee_profiles SET rank = ?, updated_at = ? WHERE name = ?`).run(
      String(rank || '').trim() || null,
      now,
      clean,
    )
  }
  return getExamineeProfile(clean)
}
