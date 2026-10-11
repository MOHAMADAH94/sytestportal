import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isObjectiveExam,
  objectiveScoreReveal,
  showsEntryBarcode,
} from '../shared/examPresentation.js'
import { buildExamineeScoreSheet } from '../shared/examineeScoreSheet.js'
import { describeExamineeExams } from './examineeCard.js'

test('barcode is required for the written exam and examinee entry, not for oral interviews', () => {
  assert.equal(showsEntryBarcode({ category: 'theory', theoryTrack: 'office', questionTypes: ['mcq'] }), true)
  assert.equal(showsEntryBarcode({ category: 'theory', theoryTrack: 'general', questionTypes: ['open'] }), true)
  assert.equal(showsEntryBarcode({ category: 'oral', questionTypes: ['open', 'classic'] }), true)
  assert.equal(showsEntryBarcode({ category: 'oral', evaluationMode: 'suggested', questionTypes: ['oral'] }), false)
  assert.equal(showsEntryBarcode({ category: 'driving', evaluationMode: 'interview', questionTypes: ['open'] }), true)
  assert.equal(showsEntryBarcode({ category: 'personality', evaluationMode: 'manual', questionTypes: ['scale'] }), false)
  assert.equal(showsEntryBarcode({ category: 'driving', evaluationMode: 'qr', questionTypes: ['mcq'] }), true)
})

test('multiple choice scores are revealed only for a fully objective exam', () => {
  assert.equal(isObjectiveExam(['mcq', 'true_false']), true)
  assert.equal(isObjectiveExam(['mcq', 'open']), false)
  assert.equal(isObjectiveExam([]), false)
  const revealed = objectiveScoreReveal(
    [{ type: 'mcq' }, { type: 'true_false' }],
    { score: 8, maxScore: 10, needsManualReview: false },
  )
  assert.deepEqual(revealed, { revealScore: true, score: 8, maxScore: 10, percent: 80 })
  assert.equal(objectiveScoreReveal([{ type: 'open' }], { score: 0, maxScore: 0, needsManualReview: true }), null)
  assert.equal(objectiveScoreReveal([{ type: 'mcq' }], { score: 1, maxScore: 2, needsManualReview: true }), null)
})

test('examinee exams keep matrix weights beside each score', () => {
  const programmer = { jobTitle: 'مبرمج', extra: { 'نوع المقابلة': 'داخلية' } }
  const described = describeExamineeExams(programmer, [
    { examId: 'w', title: 'اختبار كتابي — الدفعة', category: 'theory', theoryTrack: 'office', score: 70 },
    { examId: 'o', title: 'شفهي برمجة', category: 'oral', oralRole: 'programmer', score: 90 },
  ])
  const writing = described.find((row) => row.examId === 'w')
  const oral = described.find((row) => row.examId === 'o')
  assert.equal(writing.weight, 20)
  assert.equal(writing.score, 70)
  assert.equal(writing.trackId, 'writing')
  assert.equal(oral.weight, 40)
  assert.equal(oral.trackId, 'programming')
  assert.ok(described.some((row) => row.trackId === 'driving' && row.score == null && row.weight === 20))
})

test('examinee workbook writes the score scaled to the exam weight', () => {
  const sheet = buildExamineeScoreSheet([
    {
      displayId: 'APP-0004',
      examineeName: 'أحمد علي حسن',
      org: 'فرع',
      jobTitle: 'مبرمج',
      rank: 'ملازم',
      finalPercent: 82,
      examResults: [
        { title: 'اختبار كتابي — الدفعة', trackId: 'writing', weight: 20, score: 70 },
        { title: 'شفهي برمجة', trackId: 'programming', weight: 40, score: 90 },
      ],
    },
    {
      displayId: 'APP-0005',
      examineeName: 'سامر نبيل عمر',
      org: 'مركز',
      jobTitle: 'حارس',
      finalPercent: 88,
      examResults: [{ title: 'عام', trackId: 'general', weight: 100, score: 88 }],
    },
  ])
  assert.deepEqual(sheet.header.slice(0, 8), [
    'المعرّف',
    'الاسم الثلاثي',
    'اسم الأب',
    'اسم الأم',
    'التولد',
    'الجهة',
    'المسمى الوظيفي',
    'الرتبة',
  ])
  assert.equal(sheet.data[0][sheet.header.indexOf('اسم الأب')], 'علي')
  assert.equal(sheet.header.at(-1), 'العلامة النهائية')
  assert.equal(sheet.header.some((name) => name.includes('الوزن %')), false)
  const writing = sheet.header.indexOf('اختبار كتابي — الدفعة (20%)')
  const oral = sheet.header.indexOf('شفهي برمجة (40%)')
  const general = sheet.header.indexOf('عام (100%)')
  assert.ok(writing > 0 && oral > writing && general > 0)
  assert.equal(sheet.data[0][writing], 14)
  assert.equal(sheet.data[0][oral], 36)
  assert.equal(sheet.data[0].at(-1), 82)
  assert.equal(sheet.data[1][general], 88)
  const scaled = buildExamineeScoreSheet([
    {
      displayId: 'APP-0006',
      examineeName: 'ليلى',
      examResults: [{ title: 'شفهي', trackId: 'programming', weight: 40, score: 75 }],
    },
  ])
  assert.equal(scaled.data[0][scaled.header.indexOf('شفهي (40%)')], 30)

  const admin = buildExamineeScoreSheet([
    {
      displayId: 'APP-0007',
      examineeName: 'سامي',
      jobTitle: 'إداري',
      finalPercent: 90,
      examResults: [
        { title: 'اختبار كتابي', trackId: 'writing', weight: 20, score: 100 },
        { title: 'أهلية قيادة', trackId: 'driving', weight: 20, score: 80 },
        { title: 'شخصية', trackId: 'personality', weight: 20, score: 100 },
      ],
    },
  ])
  const writingAdmin = admin.header.indexOf('اختبار كتابي (30%)')
  const drivingAdmin = admin.header.indexOf('أهلية قيادة (35%)')
  const personalityAdmin = admin.header.indexOf('شخصية (35%)')
  assert.ok(writingAdmin > 0 && drivingAdmin > writingAdmin && personalityAdmin > drivingAdmin)
  assert.equal(admin.header.some((name) => name.includes('(20%)') || name.includes('(40%)')), false)
  assert.equal(admin.data[0][writingAdmin], 30)
  assert.equal(admin.data[0][drivingAdmin], 28)
  assert.equal(admin.data[0][personalityAdmin], 35)

  assert.equal(sheet.data[1][writing], '')
  assert.equal(sheet.data[1].at(-1), 88)
  assert.equal(sheet.data[1][sheet.header.indexOf('الرتبة')], '')

  const merged = buildExamineeScoreSheet([
    {
      displayId: 'APP-0008',
      examineeName: 'محمد علي الخطيب',
      org: 'فرع',
      jobTitle: 'إداري',
      extra: { 'اسم الام': 'صفاء الخطيب', 'التولد': '1990-01-01', 'مكان السكن الحالي': 'حماة' },
      finalPercent: 80,
      examResults: [{ title: 'عام', trackId: 'general', weight: 100, score: 80 }],
    },
    {
      examineeName: 'محمد علي الخطيب',
      extra: { 'اسم الأم': 'صفاء الخطيب', 'تاريخ الميلاد': '1990-01-01', 'نوع الشهادة': 'ثانوية' },
      examResults: [{ title: 'شخصية', trackId: 'personality', weight: 20, score: 70 }],
    },
    {
      examineeName: 'محمد علي ليلا',
      jobTitle: 'حارس',
      extra: { 'اسم الام': 'رهف ليلا', 'التولد': '1990-01-01' },
      finalPercent: 50,
      examResults: [{ title: 'عام', trackId: 'general', weight: 100, score: 50 }],
    },
  ])
  assert.equal(merged.data.length, 2)
  assert.equal(merged.header.includes('اسم الأم'), true)
  assert.equal(merged.header.includes('مكان السكن الحالي'), true)
  assert.equal(merged.header.includes('نوع الشهادة'), true)
  const mother = merged.header.indexOf('اسم الأم')
  const home = merged.header.indexOf('مكان السكن الحالي')
  const cert = merged.header.indexOf('نوع الشهادة')
  assert.equal(merged.data[0][mother], 'صفاء الخطيب')
  assert.equal(merged.data[0][home], 'حماة')
  assert.equal(merged.data[0][cert], 'ثانوية')
  assert.equal(merged.data[1][mother], 'رهف ليلا')
  assert.equal(merged.data[0][merged.header.indexOf('عام (100%)')], 80)
  assert.equal(merged.data[0][merged.header.indexOf('شخصية (35%)')], 24.5)
})
