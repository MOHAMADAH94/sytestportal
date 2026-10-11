/**
 * بناء بنوك أسئلة عالية الجودة من scripts/content/*
 * التشغيل: node scripts/generateBanks.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { theoryRaw } from './content/theory.mjs'
import { drivingRaw } from './content/driving.mjs'
import { oralRaw } from './content/oral.mjs'
import { personalityRaw } from './content/personality.mjs'
import { personalityKnowledgeRaw } from './content/personalityKnowledge.mjs'
import { JOB_PROFILES } from '../shared/jobProfiles.js'
import { networkContent } from './content/careerNetworks.mjs'
import { softwareContent } from './content/careerSoftware.mjs'
import { analysisContent } from './content/careerAnalysis.mjs'
import { systemsContent } from './content/careerSystems.mjs'
import { supportContent } from './content/careerSupport.mjs'
import { officeContent } from './content/careerOffice.mjs'
import { expandedContent, familyContent, sharedWorkContent } from './content/expandedCareers.mjs'
import { requestedCareerContent } from './content/requestedCareerContent.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'src', 'data', 'banks')

function seededShuffle(arr, seed) {
  const a = [...arr]
  let s = seed >>> 0
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function packMcq(id, category, raw, extra = {}) {
  if (typeof raw.choices[0] === 'object') return { ...raw, id, category, ...extra }
  const ids = ['a', 'b', 'c', 'd']
  const correctText = raw.choices[0]
  const shuffled = seededShuffle(raw.choices, id.split('').reduce((n, c) => n + c.charCodeAt(0), 0))
  const choices = shuffled.map((text, i) => ({ id: ids[i], text }))
  const correctAnswer = choices.find((c) => c.text === correctText)?.id || 'a'
  return {
    id,
    category,
    type: 'mcq',
    topic: raw.topic,
    text: raw.text,
    choices,
    correctAnswer,
    answerKey: raw.answerKey,
    difficulty: raw.difficulty,
    points: raw.points,
    level: raw.level || 'both',
    ...extra,
  }
}

function packTf(id, category, raw, extra = {}) {
  return {
    id,
    category,
    type: 'true_false',
    topic: raw.topic,
    text: raw.text,
    choices: [
      { id: 'true', text: 'صح' },
      { id: 'false', text: 'خطأ' },
    ],
    correctAnswer: raw.correctTrue ? 'true' : 'false',
    answerKey: raw.answerKey,
    difficulty: raw.difficulty,
    points: raw.points,
    level: raw.level || 'both',
    ...extra,
  }
}

function packOpen(id, category, raw, type = 'open', extra = {}) {
  return {
    id,
    category,
    type,
    topic: raw.topic,
    text: raw.text,
    answerKey: raw.answerKey,
    difficulty: raw.difficulty,
    points: raw.points,
    level: raw.level || 'both',
    ...extra,
  }
}

function packFromRaw(id, category, raw, extra = {}) {
  if (raw.type === 'mcq') return packMcq(id, category, raw, extra)
  if (raw.type === 'true_false') return packTf(id, category, raw, extra)
  return packOpen(id, category, raw, raw.type || 'open', extra)
}

function toTs(exports) {
  const header = `import type { Question } from '../types'\n\n`
  return header + exports
}

function bankExport(name, questions) {
  return `export const ${name}: Question[] = JSON.parse(${JSON.stringify(JSON.stringify(questions))})\n`
}

// —— نظري ——
const theory = theoryRaw.map((raw, i) =>
  packFromRaw(`th-${String(i + 1).padStart(3, '0')}`, 'theory', raw),
)

// —— أهلية قيادة الضابط ——
const driving = drivingRaw.map((raw, i) =>
  packFromRaw(`dr-${String(i + 1).padStart(3, '0')}`, 'driving', raw),
)

// —— شخصية ——
const personality = personalityRaw.map((raw, i) => ({
  id: `pe-${String(i + 1).padStart(3, '0')}`,
  category: 'personality',
  type: 'scale',
  topic: raw.topic,
  text: raw.text,
  trait: raw.trait,
  reverse: !!raw.reverse,
  difficulty: raw.difficulty || 'medium',
  points: raw.points || 1,
  level: 'both',
}))

personalityKnowledgeRaw.forEach((raw, i) => {
  personality.push(
    packOpen(`pe-knowledge-${String(i + 1).padStart(3, '0')}`, 'personality', raw, 'open', {
      isShared: true,
      jobTitles: [],
      specialties: [],
      skill: raw.skill,
      jobLevels: ['junior', 'intermediate', 'senior', 'expert'],
      rubric: [{ criterion: raw.answerKey, maxPoints: raw.points }],
    }),
  )
})


// —— شفهي ——
const oral = []
const roles = ['technician', 'programmer', 'network_engineer', 'systems_engineer', 'admin']
for (const role of roles) {
  const list = oralRaw[role] || []
  list.forEach((raw, i) => {
    oral.push(
      packOpen(`or-${role.slice(0, 3)}-${String(i + 1).padStart(3, '0')}`, 'oral', raw, 'oral', {
        role,
        level: raw.level || (role === 'technician' ? 'technician' : 'engineer'),
      }),
    )
  })
}

const levels = { easy: ['junior', 'intermediate'], medium: ['intermediate', 'senior'], hard: ['senior', 'expert'], advanced: ['expert'] }
const topicProfiles = {
  'الشبكات': ['network_engineer', 'technician'],
  'أمن المعلومات': ['network_engineer', 'systems_engineer'],
  'قواعد البيانات': ['software_engineer', 'systems_engineer'],
  'نظم التشغيل': ['systems_engineer', 'technician'],
  'البرمجة': ['software_engineer'],
  'أساسيات الحاسب': ['technician'],
  'السحابة': ['systems_engineer'],
  'تطوير الويب': ['software_engineer'],
  ...Object.fromEntries(['Excel', 'Word', 'PowerPoint', 'Outlook والبريد', 'Windows مكتبي', 'أعمال إدارية مكتبية'].map((topic) => [topic, ['office_admin']])),
}
for (const q of [...theory, ...oral, ...driving, ...personality]) {
  q.isShared = ['driving', 'personality'].includes(q.category)
  q.jobTitles = q.isShared ? [] : q.category === 'oral'
    ? JOB_PROFILES.filter((p) => ['network_engineer','software_engineer','systems_engineer','technician','office_admin'].includes(p.id) && p.oralRole === q.role).map((p) => p.id)
    : topicProfiles[q.topic] || []
  q.specialties = [...new Set(JOB_PROFILES.filter((p) => q.jobTitles.includes(p.id)).map((p) => p.specialty))]
  q.jobLevels = q.jobLevels || (q.isShared ? ['junior', 'intermediate', 'senior', 'expert'] : levels[q.difficulty])
  q.skill = q.topic
}
const content = { network_engineer: networkContent, software_engineer: softwareContent, systems_analyst: analysisContent, systems_engineer: systemsContent, technician: supportContent, office_admin: officeContent, ...expandedContent, ...requestedCareerContent }
const banks = { theory, oral, driving, personality }
for (const profile of JOB_PROFILES) {
  for (const [category, list] of Object.entries(content[profile.id] || {})) {
    list.forEach((source, i) => {
      const raw = { ...source, type: category === 'theory' && source.type === 'oral' ? 'open' : source.type, points: source.points || (['oral', 'open'].includes(source.type) ? 5 : 1) }
      const q = packFromRaw(`job-${profile.id}-${category}-${String(i + 1).padStart(3, '0')}`, category, raw, {
        isShared: false, jobTitles: [profile.id], specialties: [profile.specialty], jobLevels: levels[raw.difficulty],
        skill: raw.skill || raw.topic, level: profile.level,
        ...(category === 'oral' ? { role: profile.oralRole } : {}),
        ...(raw.type === 'scale' ? { trait: raw.trait, reverse: !!raw.reverse } : {}),
        ...(['open', 'oral'].includes(raw.type) ? { rubric: [{ criterion: raw.answerKey, maxPoints: raw.points }] } : {}),
      })
      banks[category].push(q)
    })
  }
}
const allJobLevels = ['junior', 'intermediate', 'senior', 'expert']
for (const profile of JOB_PROFILES.filter((item) => item.id !== 'unclassified')) {
  const specialty = profile.specialtyLabel || profile.label
  const theorySupplement = [
    { type:'mcq', skill:'أساسيات المجال', topic:'أساسيات المجال', text:`ما المرجع الأول قبل تنفيذ مهمة جديدة في «${profile.label}» ضمن ${specialty}؟`, answerKey:'التكليف المعتمد والإجراء النافذ وحدود الصلاحية', choices:['التكليف المعتمد والإجراء النافذ وحدود الصلاحية','ذاكرة الموظف وحدها','نسخة قديمة غير مؤرخة','تعليمات شخص غير مخول'], difficulty:'easy' },
    { type:'mcq', skill:'التوثيق', topic:'التوثيق', text:`ما الذي يجعل سجل عمل «${profile.label}» قابلًا للمراجعة؟`, answerKey:'مرجع المهمة والوقت والمنفذ والنتيجة والاستثناءات', choices:['مرجع المهمة والوقت والمنفذ والنتيجة والاستثناءات','النتيجة دون مصدر','اسم الملف فقط','ملاحظة شفهية بعد انتهاء العمل'], difficulty:'easy' },
    { type:'open', skill:'التواصل', topic:'التواصل', text:`كيف يطلب موظف «${profile.label}» استكمال بيانات ناقصة دون تعطيل العمل؟`, answerKey:'يحدد الحقل أو المتطلب الناقص ومصدره وأثره والموعد؛ يتابع عبر قناة معتمدة؛ ولا يخمن قيمة بديلة.', difficulty:'medium' },
    { type:'open', skill:'ضبط الجودة', topic:'ضبط الجودة', text:`صف فحصًا نهائيًا مناسبًا لناتج عمل «${profile.label}» في مجال ${specialty}.`, answerKey:'مطابقة الناتج بالتكليف والمواصفة؛ فحص العناصر الحرجة؛ تسجيل الدليل والاستثناء؛ واعتماد المستلم المخول.', difficulty:'medium' },
    { type:'open', skill:'حل المشكلات', topic:'حل المشكلات', text:`تكرر خلل في عمل «${profile.label}» بعد معالجته. كيف تميز السبب عن العرض؟`, answerKey:'يجمع تسلسل الوقائع والقياسات؛ يقارن الحالات؛ يختبر فرضيات مأذونة؛ ويثبت أن الإجراء أزال السبب قبل الإغلاق.', difficulty:'hard' },
    { type:'open', skill:'إدارة التغيير', topic:'إدارة التغيير', text:`تغير إجراء أساسي في ${specialty}. ما الذي يجب على موظف «${profile.label}» التحقق منه قبل التطبيق؟`, answerKey:'الإصدار وتاريخ النفاذ والصلاحيات والأعمال الجارية والتدريب والأثر والرجوع، ثم توثيق تطبيق النسخة الصحيحة.', difficulty:'hard' },
    { type:'open', skill:'استمرارية العمل', topic:'استمرارية العمل', text:`كيف يجهز فريق «${profile.label}» لاستمرار العمل عند غياب صاحب الخبرة الوحيد؟`, answerKey:'توثيق المعرفة؛ تحديد بديل وصلاحياته؛ تدريب عملي؛ اختبار القدرة؛ مسار دعم؛ وتسليم الأعمال المفتوحة والسجلات.', difficulty:'advanced' },
    { type:'open', skill:'التحسين المبني على البيانات', topic:'التحسين المبني على البيانات', text:`كيف يثبت مسؤول «${profile.label}» أن تحسينًا مقترحًا في ${specialty} نجح؟`, answerKey:'يحدد خط أساس ومؤشرات جودة وزمن ومخاطر؛ يجرب على نطاق مضبوط؛ يقارن النتائج؛ ويوثق قرار التعميم أو التراجع.', difficulty:'advanced' },
  ]
  const oralSupplement = [
    ['فهم الدور', `ما مسؤوليتك الأساسية وحدود صلاحيتك في وظيفة «${profile.label}»؟`, 'تحديد النتيجة المطلوبة والمهام المأذونة وما يحتاج اعتمادًا أو اختصاصًا آخر مع الالتزام بالتوثيق.', 'easy'],
    ['الاستعداد', `كيف تستعد لأول مهمة يومية في «${profile.label}»؟`, 'مراجعة التكليف والأولوية والوسائل والحالة السابقة ومخاطر العمل ثم إثبات الجاهزية والنواقص.', 'easy'],
    ['التسليم', `ما المعلومات التي تقدمها عند تسليم عمل «${profile.label}» لزميل؟`, 'الحالة الحالية وما أُنجز وما بقي والمخاطر والمراجع والموعد والمسؤول التالي مع تأكيد الاستلام.', 'easy'],
    ['خدمة المستفيد', `كيف تتعامل في «${profile.label}» مع مستفيد غاضب من التأخير؟`, 'الاستماع وتحديد الطلب والوقائع وشرح الحالة الواقعية والخيارات المسموحة والموعد والتصعيد دون وعد غير ممكن.', 'medium'],
    ['الدقة', `اكتشفت اختلافًا بين تعليمات مهمتين متشابهتين في ${specialty}. ماذا تفعل؟`, 'تثبت المرجع والإصدار والنطاق؛ توقف الجزء المتعارض؛ وتطلب حسمًا من المخول ثم توثق القرار.', 'medium'],
    ['المسؤولية', `كيف تتصرف إذا تسببت بخطأ في عمل «${profile.label}»؟`, 'الإبلاغ المبكر وحماية المتأثرين وتحديد الوقائع والأثر وتصحيح معتمد وحفظ الأثر ومراجعة سبب التكرار.', 'medium'],
    ['التعاون', `زميل جديد يحتاج مساعدتك في مهمة «${profile.label}» وأنت مشغول. كيف تنظم المساندة؟`, 'تحدد أولوية المهمة وحدود ما يمكن تفويضه وتوفر مرجعًا أو شرحًا آمنًا وتتفق على نقطة مراجعة دون تركه يتخبط.', 'medium'],
    ['قرار مهني', `طُلب منك اختصار فحص مهم لتسريع عمل «${profile.label}». كيف تجيب؟`, 'توضح أثر الاختصار والحد غير القابل للتجاوز وتقترح تسريعًا مأذونًا وترفع الاستثناء لصاحب القرار.', 'hard'],
    ['تحليل واقعة', `اعرض طريقة تحليل شكوى متكررة تخص ${specialty}.`, 'تصنيف الوقائع والمصادر والتوقيت وحجم التكرار؛ تحديد السبب المحتمل؛ تجربة إجراء؛ وقياس الإغلاق وإعادة الشكوى.', 'hard'],
    ['تعارض الأولويات', `كيف تدير ثلاث مهام متزامنة في «${profile.label}» بموارد لا تكفي إلا لمهمتين؟`, 'ترتيب موثق حسب السلامة والأثر والموعد؛ طلب قرار ودعم؛ إبلاغ الأطراف؛ ومتابعة المهمة المؤجلة.', 'hard'],
    ['قياس الأداء', `ما مؤشرات الأداء التي تقترحها لوظيفة «${profile.label}»؟`, 'جودة القبول والدقة والالتزام بالوقت وإعادة العمل والاستثناءات والسلامة ورضا المستفيد مع حجم وتعقيد العمل.', 'advanced'],
    ['تطوير المجال', `ضع خطة تسعين يومًا لتحسين أداء فريق «${profile.label}» في ${specialty}.`, 'خط أساس وأولويات ومهارات مستهدفة وإجراءات قصيرة وملاك ومواعيد ومؤشرات ومراجعات دورية وتعديل مبني على النتائج.', 'advanced'],
  ].map(([skill,text,answerKey,difficulty]) => ({ type:'oral', skill, topic:skill, text, answerKey, difficulty }))
  for (const [category, sources] of Object.entries({ theory:theorySupplement, oral:oralSupplement })) {
    sources.forEach((raw, i) => banks[category].push(packFromRaw(`supp-${profile.id}-${category}-${String(i + 1).padStart(2,'0')}`, category, { ...raw, points:raw.type === 'mcq' ? 1 : 5 }, {
      isShared:false, jobTitles:[profile.id], specialties:[profile.specialty], jobLevels:allJobLevels,
      skill:raw.skill, level:profile.level, ...(category === 'oral' ? { role:profile.oralRole } : {}),
      ...(['open','oral'].includes(raw.type) ? { rubric:[{ criterion:raw.answerKey,maxPoints:5 }] } : {}),
    })))
  }
  for (const [category, sources] of Object.entries(sharedWorkContent)) {
    sources.forEach((source, i) => {
      const raw = {
        ...source,
        text: `${source.text} — طبّق إجابتك في سياق وظيفة «${profile.label}».`,
        points:['open','oral'].includes(source.type) ? 5 : 1,
      }
      banks[category].push(packFromRaw(`common-${profile.id}-${category}-${String(i + 1).padStart(2,'0')}`, category, raw, {
        isShared:false, jobTitles:[profile.id], specialties:[profile.specialty], jobLevels:allJobLevels,
        skill:raw.skill, level:profile.level, ...(category === 'oral' ? { role:profile.oralRole } : {}),
        ...(['open','oral'].includes(raw.type) ? { rubric:[{ criterion:raw.answerKey,maxPoints:raw.points }] } : {}),
      }))
    })
  }
}
const originalFamilies = { office_admin:'administrative', technician:'technical', network_engineer:'engineering', software_engineer:'engineering', systems_engineer:'engineering', systems_analyst:'engineering' }
for (const [family, entries] of [...Object.entries(familyContent), ['shared', sharedWorkContent]]) {
  const profiles = family === 'shared' ? [] : JOB_PROFILES.filter((p) => (p.family || originalFamilies[p.id]) === family)
  for (const [category, list] of Object.entries(entries)) list.forEach((source, i) => {
    const raw = { ...source, points:['open','oral'].includes(source.type) ? 5 : 1 }
    const q = packFromRaw(`${family === 'shared' ? 'shared-work' : 'family-' + family}-${category}-${String(i + 1).padStart(3,'0')}`, category, raw, {
      isShared:family === 'shared', jobTitles:profiles.map((p) => p.id), specialties:[...new Set(profiles.map((p) => p.specialty))],
      jobLevels:family === 'shared' ? allJobLevels : levels[raw.difficulty], skill:raw.skill, level:'both',
      ...(category === 'oral' ? { role:'admin' } : {}),
      ...(raw.type === 'scale' ? { trait:raw.trait, reverse:raw.reverse } : {}),
      ...(['open','oral'].includes(raw.type) ? { rubric:[{ criterion:raw.answerKey,maxPoints:raw.points }] } : {})
    })
    banks[category].push(q)
  })
}
const all = Object.values(banks).flat()
if (new Set(all.map((q) => q.id)).size !== all.length) throw new Error('Duplicate question IDs')
const PERSONALITY_REVERSE_IDS = personality.filter((q) => q.reverse).map((q) => q.id)
fs.writeFileSync(path.join(__dirname, '..', 'server', 'question-bank.json'), JSON.stringify(all, null, 2))
fs.mkdirSync(outDir, { recursive: true })

fs.writeFileSync(
  path.join(outDir, 'theory.ts'),
  toTs(bankExport('theoryBank', theory)),
)

fs.writeFileSync(
  path.join(outDir, 'driving.ts'),
  toTs(bankExport('drivingBank', driving)),
)

fs.writeFileSync(
  path.join(outDir, 'oral.ts'),
  toTs(bankExport('oralBank', oral)),
)

fs.writeFileSync(
  path.join(outDir, 'personality.ts'),
  toTs(
    bankExport('personalityBank', personality) + '\n' +
      `export const PERSONALITY_REVERSE_IDS = new Set(${JSON.stringify(PERSONALITY_REVERSE_IDS)})\n`,
  ),
)

console.log('✓ بنوك عالية الجودة:')
console.log(`  نظري: ${theory.length}`)
console.log(`  قيادة: ${driving.length}`)
console.log(`  شخصية: ${personality.length} (معكوس: ${PERSONALITY_REVERSE_IDS.length})`)
console.log(`  شفهي: ${oral.length} (${roles.map((r) => `${r}:${(oralRaw[r] || []).length}`).join(', ')})`)

// تحقق سريع من جودة التوزيع
const mcqCorrect = theory.filter((q) => q.type === 'mcq').map((q) => q.correctAnswer)
const dist = Object.fromEntries(['a', 'b', 'c', 'd'].map((k) => [k, mcqCorrect.filter((x) => x === k).length]))
console.log('  توزيع إجابات النظري (MCQ):', dist)
