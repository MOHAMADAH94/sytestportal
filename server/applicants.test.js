import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-applicants-'))
process.env.EXAM_DATA_DIR = dataDirectory

const { db } = await import('./db.js')
const { importApplicants, listApplicants } = await import('./applicants.js')

test.after(() => {
  db.close()
  fs.rmSync(dataDirectory, { recursive: true, force: true })
})

test('Excel imports are cumulative and preserve existing values', () => {
  const first = importApplicants([
    {
      seqNumber: 1,
      name: 'أحمد محمد علي',
      extra: {
        'السوية التنظيمية الأولى': 'إدارة التقنية',
        'مسمى العمل': 'مبرمج',
        'الرقم الوطني': '100',
      },
    },
    { seqNumber: 2, name: 'خالد محمود', extra: { 'مسمى العمل': 'حارس' } },
  ])
  assert.deepEqual(
    { created: first.created, updated: first.updated, total: first.total },
    { created: 2, updated: 0, total: 2 },
  )

  // Even an older client that sends replace=true cannot erase the existing roster.
  const second = importApplicants([
    {
      seqNumber: 1,
      name: 'أحمد محمد علي',
      extra: { 'رقم الهاتف': '0990000000' },
    },
    {
      seqNumber: 1,
      name: 'ليلى حسن',
      extra: { 'مسمى العمل': 'محللة نظم' },
    },
  ], { replace: true })

  assert.deepEqual(
    { created: second.created, updated: second.updated, total: second.total },
    { created: 1, updated: 1, total: 3 },
  )

  const applicants = listApplicants()
  const ahmad = applicants.find((row) => row.name === 'أحمد محمد علي')
  const khaled = applicants.find((row) => row.name === 'خالد محمود')
  const layla = applicants.find((row) => row.name === 'ليلى حسن')

  assert.ok(ahmad)
  assert.equal(ahmad.seqNumber, 1)
  assert.equal(ahmad.org, 'إدارة التقنية')
  assert.equal(ahmad.jobTitle, 'مبرمج')
  assert.equal(ahmad.extra['الرقم الوطني'], '100')
  assert.equal(ahmad.extra['رقم الهاتف'], '0990000000')
  assert.ok(khaled, 'the prior applicant must remain after every later import')
  assert.ok(layla)
  assert.notEqual(layla.seqNumber, 1, 'a new file sequence must not collide with an existing display ID')
  assert.equal(new Set(applicants.map((row) => row.displayId)).size, applicants.length)
})

test('re-import matches by name even when sequence was remapped', () => {
  const first = importApplicants([
    { seqNumber: 10, name: 'سامي فهد العلي', extra: { 'الرقم الوطني': '555' } },
  ])
  assert.equal(first.created, 1)

  const second = importApplicants([
    { seqNumber: 99, name: 'سامي فهد العلي', extra: { 'رقم الهاتف': '0991111111' } },
  ])
  assert.deepEqual(
    { created: second.created, updated: second.updated },
    { created: 0, updated: 1 },
  )

  const third = importApplicants([
    { seqNumber: 1, name: 'سامي فهد', extra: { 'الرقم الوطني': '555', 'ملاحظات': 'نفس الشخص' } },
  ])
  assert.deepEqual(
    { created: third.created, updated: third.updated },
    { created: 0, updated: 1 },
  )

  const matches = listApplicants().filter((row) => (row.extra?.['الرقم الوطني'] || '') === '555' || row.name.includes('سامي'))
  assert.equal(matches.length, 1)
  assert.equal(matches[0].extra['رقم الهاتف'], '0991111111')
  assert.equal(matches[0].extra['ملاحظات'], 'نفس الشخص')
  assert.match(matches[0].name, /سامي فهد العلي/)
})
