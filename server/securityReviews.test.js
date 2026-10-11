import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-security-'))
process.env.EXAM_DATA_DIR = dataDirectory

const { db } = await import('./db.js')
const { createApplicant } = await import('./applicants.js')
const { listSecurityQueue, saveSecurityReview, saveSecurityReviewsBulk, getCurrentSecurityReview } = await import('./securityReviews.js')

test.after(() => {
  db.close()
  fs.rmSync(dataDirectory, { recursive: true, force: true })
})

test('security review accepts and rejects with required note', () => {
  const applicant = createApplicant({ name: 'مرشح أمني تجريبي كامل', extra: { 'نوع المقابلة': 'داخلية' } })
  const queue = listSecurityQueue()
  assert.ok(queue.some((row) => row.id === applicant.id))

  const accepted = saveSecurityReview(applicant.id, { decision: 'accepted', note: 'لا ملاحظات' }, {
    role: 'operator',
    category: 'security',
    username: 'military_security',
    label: 'الأمن العسكري',
    id: 'sec-1',
  })
  assert.equal(accepted.decision, 'accepted')
  assert.equal(getCurrentSecurityReview(applicant.id)?.decision, 'accepted')

  assert.throws(
    () => saveSecurityReview(applicant.id, { decision: 'rejected', note: '' }, {
      role: 'operator', category: 'security', username: 'military_security', label: 'الأمن العسكري', id: 'sec-1',
    }),
    /ملاحظة/,
  )

  const rejected = saveSecurityReview(applicant.id, { decision: 'rejected', note: 'تحفظ أمني' }, {
    role: 'operator',
    category: 'security',
    username: 'military_security',
    label: 'الأمن العسكري',
    id: 'sec-1',
  })
  assert.equal(rejected.decision, 'rejected')
  assert.equal(rejected.note, 'تحفظ أمني')
  assert.equal(getCurrentSecurityReview(applicant.id)?.decision, 'rejected')
})

test('security review supports unspecified for people without exams', () => {
  const applicant = createApplicant({ name: 'مرشح بلا اختبار بعد', jobTitle: 'حارس' })
  const user = { role: 'operator', category: 'security', username: 'military_security', label: 'الأمن العسكري', id: 'sec-1' }
  const review = saveSecurityReview(applicant.id, { decision: 'unspecified', note: 'لم يتقدم بعد' }, user)
  assert.equal(review.decision, 'unspecified')
  assert.equal(review.decisionLabelAr, 'غير محدد')
  assert.equal(getCurrentSecurityReview(applicant.id)?.decision, 'unspecified')
})

test('security review can accept a group in one decision', () => {
  const first = createApplicant({ name: 'مرشح جماعي أول', jobTitle: 'حارس' })
  const second = createApplicant({ name: 'مرشح جماعي ثان', jobTitle: 'حارس' })
  const user = { role: 'operator', category: 'security', username: 'military_security', label: 'الأمن العسكري', id: 'sec-1' }
  const result = saveSecurityReviewsBulk([first.id, second.id], { decision: 'accepted', note: 'دفعة واحدة' }, user)
  assert.equal(result.count, 2)
  assert.equal(getCurrentSecurityReview(first.id)?.decision, 'accepted')
  assert.equal(getCurrentSecurityReview(second.id)?.note, 'دفعة واحدة')
})
