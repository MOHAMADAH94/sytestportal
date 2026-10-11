/**
 * يفرّغ بيانات التشغيل (متقدمين/اختبارات/نتائج) ويبني عينة كاملة وفق آلية التقييم
 * لتجربة ظهور الاختبارات على حسابات الوصول.
 *
 * الاستخدام: node scripts/seed-matrix-demo.mjs
 */
import { randomUUID } from 'node:crypto'
import { db } from '../server/db.js'
import { installArchiveProtection } from '../server/archiveProtection.js'
import { createApplicant, listApplicants } from '../server/applicants.js'
import { insertExamRoster } from '../server/roster.js'
import { createJobExamService } from '../server/jobExams.js'
import { groupApplicants, resolveJobProfile, effectiveJobTitle } from '../shared/jobProfiles.js'
import { tracksForApplicant, resolveEvaluationStream, resolveOralSpecialtyTrack } from '../shared/evaluationMatrix.js'
import { candidateVisibleToOperator } from '../shared/evaluationMatrix.js'

const admin = { role: 'admin', username: 'admin' }

const DEMO_APPLICANTS = [
  // خدمي → عام + أمن فقط
  { name: 'أحمد علي الحارس', jobTitle: 'حارس', org: 'فرع الخدمات', interviewType: 'داخلية', rank: 'رقيب' },
  { name: 'سامي فهد المستخدم', jobTitle: 'مستخدم', org: 'فرع الخدمات', interviewType: 'داخلية', rank: 'جندي' },
  // اداري → شفهي + كتابي + قيادة + أمن
  { name: 'ليلى حسن الديوان', jobTitle: 'موظف ديوان', org: 'الإدارة', interviewType: 'داخلية', rank: 'مدني' },
  { name: 'كريم علي اللوجستي', jobTitle: 'لوجستي', org: 'الإمداد', interviewType: 'داخلية', rank: 'مدني' },
  // اختصاصي داخلي — فني
  { name: 'مازن سعيد الفني', jobTitle: 'فني حاسب آلي', org: 'الدعم الفني', interviewType: 'داخلية', rank: 'مدني' },
  { name: 'هاني خالد الكهربائي', jobTitle: 'فني كهرباء', org: 'الصيانة', interviewType: 'داخلية', rank: 'مدني' },
  // اختصاصي داخلي — برمجة/نظم
  { name: 'نور محمد المبرمج', jobTitle: 'مبرمج', org: 'التطوير', interviewType: 'داخلية', rank: 'مدني' },
  { name: 'ياسر محمود النظم', jobTitle: 'مهندس نظم', org: 'الأنظمة', interviewType: 'داخلية', rank: 'مدني' },
  // اختصاصي داخلي — شبكات
  { name: 'فادي حسن الشبكات', jobTitle: 'مهندس شبكات', org: 'البنية التحتية', interviewType: 'داخلية', rank: 'مدني' },
  // اختصاصي خارجي — برمجة
  { name: 'رنا سامي الخارجية', jobTitle: 'مهندس برمجيات', org: 'شركة خارجية', interviewType: 'خارجية', rank: 'مدني' },
  // اختصاصي خارجي — شبكات
  { name: 'وليد أحمد الشبكات', jobTitle: 'مهندس شبكات', org: 'مقاول', interviewType: 'خارجية', rank: 'مدني' },
  // اختصاصي خارجي — فني
  { name: 'تامر فهد الفني', jobTitle: 'فني حاسب آلي', org: 'مقاول', interviewType: 'خارجية', rank: 'مدني' },
]

function wipeOperationalData() {
  // حماية الأرشيف تمنع الحذف العادي؛ نرفع محفزات الحذف مؤقتاً لإعادة تهيئة بيئة التجربة فقط.
  const deleteTriggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'retain_%_delete'")
    .all()
    .map((r) => r.name)
  for (const name of deleteTriggers) db.exec(`DROP TRIGGER IF EXISTS ${name}`)

  const tables = [
    'result_audit_log',
    'decision_adoptions',
    'security_reviews',
    'assessment_archive',
    'archive_versions',
    'exam_retention_log',
    'evaluation_scores',
    'evaluation_session_audit',
    'evaluation_sessions',
    'evaluation_runs',
    'monitoring_events',
    'exam_monitor_events',
    'live_monitor_sessions',
    'committee_results',
    'attempts',
    'exam_question_sets',
    'job_exam_configs',
    'exam_roster',
    'exams',
    'applicants',
    'examinee_profiles',
  ]
  const tx = db.transaction(() => {
    for (const table of tables) {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)
      if (exists) db.prepare(`DELETE FROM ${table}`).run()
    }
  })
  tx()

  // إعادة تثبيت حماية الأرشيف على الجداول الفارغة
  installArchiveProtection(db)
  console.log('✓ فُرّغت بيانات المتقدمين والاختبارات والنتائج (الحسابات محفوظة)')
}

function seedApplicants() {
  const created = []
  let seq = 1
  for (const row of DEMO_APPLICANTS) {
    const applicant = createApplicant({
      name: row.name,
      seqNumber: seq++,
      org: row.org,
      jobTitle: row.jobTitle,
      jobTitleCommittee: row.jobTitle,
      rank: row.rank,
      extra: { 'نوع المقابلة': row.interviewType },
    })
    created.push(applicant)
    const stream = resolveEvaluationStream(applicant)
    const oral = resolveOralSpecialtyTrack(applicant)
    const tracks = tracksForApplicant(applicant).map((t) => t.label).join(' · ')
    console.log(`  • ${applicant.name} — ${effectiveJobTitle(applicant)} | ${stream.label}${oral ? ` / شفهي:${oral}` : ''} → ${tracks}`)
  }
  return created
}

function groupConfigs(applicants, { questionCount = 8, includeShared = false, questionTypes = [] } = {}) {
  return groupApplicants(applicants).map((g) => {
    const profile = resolveJobProfile(g.jobTitle) || { id: g.profileId || 'unclassified', specialty: 'unclassified' }
    return {
      key: g.key,
      profileId: profile.id || g.profileId || 'unclassified',
      specialty: profile.specialty || 'unclassified',
      jobLevel: 'intermediate',
      difficulty: 'mixed',
      questionCount,
      includeShared,
      skills: [],
      questionTypes,
    }
  })
}

function filterByTrack(applicants, trackId) {
  return applicants.filter((a) => tracksForApplicant(a).some((t) => t.id === trackId))
}

function seedExams(applicants) {
  const jobExams = createJobExamService(db, {
    getApplicantsByIds: (ids) => {
      const all = listApplicants()
      return ids.map((id) => all.find((a) => a.id === id)).filter(Boolean)
    },
    insertExamRoster,
  })

  const created = []

  // عام — خدمي فقط
  {
    const list = filterByTrack(applicants, 'general')
    if (list.length) {
      const result = jobExams.create(admin, {
        title: 'تجربة آلية التقييم — عام (خدمي)',
        category: 'theory',
        applicantIds: list.map((a) => a.id),
        groups: groupConfigs(list, { questionCount: 8 }),
      })
      created.push(...(result.exams || [result]))
      console.log(`✓ عام: ${list.length} متقدم → ${result.exam.title}`)
    }
  }

  // كتابة / مكتبي — إداري + اختصاصيون
  {
    const list = filterByTrack(applicants, 'writing')
    if (list.length) {
      const result = jobExams.create(admin, {
        title: 'تجربة آلية التقييم — كتابة مكتبية',
        category: 'theory',
        applicantIds: list.map((a) => a.id),
        groups: groupConfigs(list, { questionCount: 8 }),
      })
      // force office track visibility via theory exams that include office titles
      created.push(...(result.exams || [result]))
      console.log(`✓ كتابة: ${list.length} متقدم → ${result.exam.title}`)
    }
  }

  // شخصية
  {
    const list = filterByTrack(applicants, 'personality')
    if (list.length) {
      const result = jobExams.create(admin, {
        title: 'تجربة آلية التقييم — شخصية',
        category: 'personality',
        evaluationMode: 'qr',
        applicantIds: list.map((a) => a.id),
        groups: groupConfigs(list, { questionCount: 8, includeShared: true }),
      })
      created.push(...(result.exams || [result]))
      console.log(`✓ شخصية: ${list.length} متقدم → ${result.exam.title}`)
    }
  }

  // قيادة
  {
    const list = filterByTrack(applicants, 'driving')
    if (list.length) {
      const result = jobExams.create(admin, {
        title: 'تجربة آلية التقييم — أهلية قيادة',
        category: 'driving',
        evaluationMode: 'qr',
        applicantIds: list.map((a) => a.id),
        groups: groupConfigs(list, { questionCount: 6, includeShared: true }),
      })
      created.push(...(result.exams || [result]))
      console.log(`✓ قيادة: ${list.length} متقدم → ${result.exam.title}`)
    }
  }

  // شفهي — يُفصل تلقائياً فني / برمجة / شبكات
  {
    const list = applicants.filter((a) =>
      tracksForApplicant(a).some((t) => ['maintenance', 'programming', 'networks'].includes(t.id)),
    )
    if (list.length) {
      const result = jobExams.create(admin, {
        title: 'تجربة آلية التقييم — شفهي',
        category: 'oral',
        evaluationMode: 'qr',
        applicantIds: list.map((a) => a.id),
        groups: groupConfigs(list, { questionCount: 6 }),
      })
      for (const item of result.exams || [result]) {
        created.push(item)
        console.log(`✓ شفهي [${item.exam.oral_role}]: ${item.roster.length} متقدم → ${item.exam.title}`)
      }
    }
  }

  return created
}

function printVisibility(applicants, exams) {
  const accounts = [
    { username: 'theory', role: 'operator', category: 'theory', theoryTrack: 'general' },
    { username: 'office', role: 'operator', category: 'theory', theoryTrack: 'office' },
    { username: 'oral_tech', role: 'operator', category: 'oral', oralRole: 'technician' },
    { username: 'oral_prog', role: 'operator', category: 'oral', oralRole: 'programmer' },
    { username: 'oral_net', role: 'operator', category: 'oral', oralRole: 'network_engineer' },
    { username: 'driving', role: 'operator', category: 'driving' },
    { username: 'personality', role: 'operator', category: 'personality' },
    { username: 'military_security', role: 'operator', category: 'security' },
  ]

  console.log('\n—— ظهور المتقدمين لكل حساب ——')
  for (const user of accounts) {
    const visible = applicants.filter((a) => candidateVisibleToOperator(user, a))
    console.log(`${user.username}: ${visible.length} → ${visible.map((a) => a.name.split(' ')[0]).join(', ') || '—'}`)
  }

  console.log('\n—— ظهور الاختبارات لكل حساب ——')
  for (const user of accounts) {
    const visible = exams.filter((item) => {
      const exam = item.exam
      if (exam.category !== user.category) return false
      if (user.oralRole && exam.oral_role && exam.oral_role !== user.oralRole
        && !(user.oralRole === 'programmer' && exam.oral_role === 'programmer')) {
        // programmer/systems merge already stored as programmer
        if (!(['programmer', 'systems_engineer'].includes(user.oralRole) && exam.oral_role === 'programmer')) {
          return false
        }
      }
      if (user.oralRole && !exam.oral_role) return false
      if (user.category === 'theory' && user.theoryTrack === 'general') {
        // general theory exam title marker
        return /عام|خدمي/.test(exam.title) || item.roster?.some((r) => candidateVisibleToOperator(user, {
          jobTitle: r.jobTitle || r.job_title,
          extra: r.extra || {},
        }))
      }
      if (user.category === 'theory' && user.theoryTrack === 'office') {
        return /كتابة|مكتبي/.test(exam.title) || item.roster?.some((r) => candidateVisibleToOperator(user, {
          jobTitle: r.jobTitle || r.job_title,
          jobTitleCommittee: r.jobTitle,
          extra: r.extra || {},
        }))
      }
      const roster = item.roster || []
      if (!roster.length) return true
      return roster.some((r) => candidateVisibleToOperator(user, {
        ...r,
        jobTitle: r.jobTitle || r.job_title,
      }))
    })
    console.log(`${user.username}: ${visible.length} اختبار → ${visible.map((v) => v.exam.title.replace('تجربة آلية التقييم — ', '')).join(' | ') || '—'}`)
  }
}

wipeOperationalData()
console.log('\n—— المتقدمون ——')
const applicants = seedApplicants()
console.log(`\n✓ ${applicants.length} متقدم`)
console.log('\n—— الاختبارات ——')
const exams = seedExams(applicants)
console.log(`\n✓ ${exams.length} اختبار`)
printVisibility(applicants, exams)
console.log('\nكلمات المرور الافتراضية (إن لزم): npm run passwords:reset')
console.log('أعد تشغيل الخادم ثم جرّب الدخول بالحسابات.')
