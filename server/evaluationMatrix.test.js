import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applicantAllowsTrack,
  candidateVisibleToOperator,
  resolveEvaluationStream,
  resolveOperatorTrack,
  resolveOralSpecialtyTrack,
  summarizeTracksForApplicants,
  tracksForApplicant,
} from '../shared/evaluationMatrix.js'

describe('evaluationMatrix — آلية التقييم.xlsx', () => {
  it('يصنّف الخدمية والإداري والاختصاصي وفق المسمى', () => {
    assert.equal(resolveEvaluationStream({ jobTitle: 'حارس' }).id, 'services')
    assert.equal(resolveEvaluationStream({ jobTitle: 'لوجستي' }).id, 'administrative')
    assert.equal(resolveEvaluationStream({ jobTitle: 'مبرمج' }).id, 'programming')
    assert.equal(resolveEvaluationStream({ jobTitle: 'مهندس شبكات', extra: { 'نوع المقابلة': 'خارجية' } }).id, 'networks')
    assert.equal(resolveEvaluationStream({ jobTitle: 'فني حاسب آلي' }).id, 'maintenance')
  })

  it('يعطي كل اختصاصي مساراً شفهياً واحداً فقط حسب المسمى', () => {
    assert.equal(resolveOralSpecialtyTrack({ jobTitle: 'فني حاسب آلي' }), 'maintenance')
    assert.equal(resolveOralSpecialtyTrack({ jobTitle: 'مبرمج' }), 'programming')
    assert.equal(resolveOralSpecialtyTrack({ jobTitle: 'مهندس نظم' }), 'programming')
    assert.equal(resolveOralSpecialtyTrack({ jobTitle: 'مهندس شبكات' }), 'networks')
    assert.equal(resolveOralSpecialtyTrack({ jobTitle: 'حارس' }), null)

    const tech = tracksForApplicant({ jobTitle: 'فني حاسب آلي', extra: { 'نوع المقابلة': 'داخلية' } }).map((t) => t.id)
    assert.ok(tech.includes('maintenance'))
    assert.equal(tech.includes('programming'), false)
    assert.equal(tech.includes('networks'), false)
    assert.ok(tech.includes('personality'))
    assert.ok(tech.includes('security'))
    assert.equal(tech.length, 5)

    const prog = tracksForApplicant({ jobTitle: 'مبرمج', extra: { 'نوع المقابلة': 'خارجية' } }).map((t) => t.id)
    assert.deepEqual(
      prog.filter((id) => ['maintenance', 'programming', 'networks'].includes(id)),
      ['programming'],
    )
    assert.equal(prog.includes('security'), true)
    assert.ok(prog.includes('writing'))
    assert.ok(prog.includes('personality'))
    assert.ok(prog.includes('driving'))

    const net = tracksForApplicant({ jobTitle: 'مهندس شبكات', extra: { 'نوع المقابلة': 'داخلية' } }).map((t) => t.id)
    assert.deepEqual(
      net.filter((id) => ['maintenance', 'programming', 'networks'].includes(id)),
      ['networks'],
    )
  })

  it('يطابق خلايا المصفوفة a/r للمسارات المشتركة', () => {
    const guard = { jobTitle: 'حارس', extra: { 'نوع المقابلة': 'داخلية' } }
    assert.equal(applicantAllowsTrack(guard, 'general'), true)
    assert.equal(applicantAllowsTrack(guard, 'security'), true)
    assert.equal(applicantAllowsTrack(guard, 'personality'), false)
    // الخدمية لا تُقيَّم شفهياً تخصصياً رغم أن resolveOralSpecialtyTrack يعيد maintenance
    assert.equal(applicantAllowsTrack(guard, 'maintenance'), false)

    const admin = { jobTitle: 'إداري', extra: { 'نوع المقابلة': 'داخلية' } }
    assert.equal(applicantAllowsTrack(admin, 'general'), false)
    assert.equal(applicantAllowsTrack(admin, 'personality'), true)
    assert.equal(applicantAllowsTrack(admin, 'admin_oral'), false)
    assert.equal(applicantAllowsTrack(admin, 'writing'), true)
    assert.equal(applicantAllowsTrack(admin, 'driving'), true)
    assert.equal(applicantAllowsTrack(admin, 'security'), true)
    assert.equal(applicantAllowsTrack(admin, 'networks'), false)
    assert.equal(applicantAllowsTrack(admin, 'maintenance'), false)
    assert.equal(applicantAllowsTrack(admin, 'programming'), false)

    const internal = { jobTitle: 'فني حاسب آلي', extra: { 'نوع المقابلة': 'داخلية' } }
    assert.equal(applicantAllowsTrack(internal, 'security'), true)
    assert.equal(applicantAllowsTrack(internal, 'maintenance'), true)
    assert.equal(applicantAllowsTrack(internal, 'programming'), false)
    assert.equal(applicantAllowsTrack(internal, 'general'), false)

    const external = { jobTitle: 'مهندس برمجيات', extra: { 'نوع المقابلة': 'خارجية' } }
    assert.equal(applicantAllowsTrack(external, 'security'), true)
    assert.equal(applicantAllowsTrack(external, 'programming'), true)
    assert.equal(applicantAllowsTrack(external, 'networks'), false)
    assert.equal(applicantAllowsTrack(external, 'personality'), true)
  })

  it('يربط كل حساب شفهي باختبار تخصصه فقط', () => {
    const tech = { jobTitle: 'فني حاسب آلي', extra: { 'نوع المقابلة': 'داخلية' } }
    const prog = { jobTitle: 'مبرمج', extra: { 'نوع المقابلة': 'داخلية' } }
    const net = { jobTitle: 'مهندس شبكات', extra: { 'نوع المقابلة': 'داخلية' } }
    const sys = { jobTitle: 'مهندس نظم', extra: { 'نوع المقابلة': 'داخلية' } }

    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'oral', oralRole: 'technician' }, tech), true)
    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'oral', oralRole: 'technician' }, prog), false)
    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'oral', oralRole: 'technician' }, net), false)

    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'oral', oralRole: 'programmer' }, prog), true)
    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'oral', oralRole: 'programmer' }, sys), true)
    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'oral', oralRole: 'programmer' }, net), false)
    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'oral', oralRole: 'programmer' }, tech), false)

    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'oral', oralRole: 'network_engineer' }, net), true)
    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'oral', oralRole: 'network_engineer' }, prog), false)
  })

  it('لا يفرز المسمى غير المعروف إلى أي حساب', () => {
    const unknown = { jobTitle: 'منصب غير موجود في المصفوفة', extra: { 'نوع المقابلة': 'داخلية' } }
    assert.equal(resolveEvaluationStream(unknown).id, 'unresolved')
    assert.deepEqual(tracksForApplicant(unknown), [])
    for (const user of [
      { role: 'operator', category: 'theory', theoryTrack: 'general' },
      { role: 'operator', category: 'theory', theoryTrack: 'office' },
      { role: 'operator', category: 'oral', oralRole: 'network_engineer' },
      { role: 'operator', category: 'oral', oralRole: 'admin' },
      { role: 'operator', category: 'driving' },
      { role: 'operator', category: 'personality' },
    ]) {
      assert.equal(candidateVisibleToOperator(user, unknown), false)
    }
    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'oral', oralRole: 'admin' }, { jobTitle: 'مهندس شبكات', extra: { 'نوع المقابلة': 'داخلية' } }), false)
    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'oral', oralRole: 'admin' }, { jobTitle: 'إداري', extra: { 'نوع المقابلة': 'داخلية' } }), false)
    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'personality' }, { jobTitle: 'إداري', extra: { 'نوع المقابلة': 'داخلية' } }), true)
    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'driving' }, { jobTitle: 'إداري', extra: { 'نوع المقابلة': 'داخلية' } }), true)
    assert.equal(candidateVisibleToOperator({ role: 'operator', category: 'personality' }, { jobTitle: 'حارس', extra: { 'نوع المقابلة': 'داخلية' } }), false)
  })

  it('يفرز الاختبار الكتابي لمتقدمي الشفهي وأهلية القيادة وتقييم الشخصية', () => {
    const office = { role: 'operator', category: 'theory', theoryTrack: 'office' }
    assert.equal(candidateVisibleToOperator(office, { jobTitle: 'اداري بالفرع', extra: { 'نوع المقابلة': 'داخلية' } }), true)
    assert.equal(candidateVisibleToOperator(office, { jobTitle: 'إداري', extra: { 'نوع المقابلة': 'داخلية' } }), true)
    assert.equal(candidateVisibleToOperator(office, { jobTitle: 'مبرمج', extra: { 'نوع المقابلة': 'داخلية' } }), true)
    assert.equal(candidateVisibleToOperator(office, { jobTitle: 'فني حاسب آلي', extra: { 'نوع المقابلة': 'داخلية' } }), true)
    assert.equal(candidateVisibleToOperator(office, { jobTitle: 'مهندس شبكات', extra: { 'نوع المقابلة': 'خارجية' } }), true)
    assert.equal(candidateVisibleToOperator(office, { jobTitle: 'حارس', extra: { 'نوع المقابلة': 'داخلية' } }), false)
    assert.equal(candidateVisibleToOperator(office, { jobTitle: 'سائق سيارة خفيفة', extra: { 'نوع المقابلة': 'داخلية' } }), false)
  })

  it('يربط حساب المشغّل بمسار المصفوفة', () => {
    assert.equal(resolveOperatorTrack({ role: 'operator', category: 'security' }), 'security')
    assert.equal(resolveOperatorTrack({ role: 'operator', category: 'theory', theoryTrack: 'office' }), 'writing')
    assert.equal(resolveOperatorTrack({ role: 'operator', category: 'theory', theoryTrack: 'general' }), 'general')
    assert.equal(resolveOperatorTrack({ role: 'operator', category: 'oral', oralRole: 'programmer' }), 'programming')
    assert.equal(resolveOperatorTrack({ role: 'operator', category: 'oral', oralRole: 'technician' }), 'maintenance')
    assert.equal(resolveOperatorTrack({ role: 'operator', category: 'oral', oralRole: 'network_engineer' }), 'networks')
    assert.equal(resolveOperatorTrack({ role: 'operator', category: 'oral', oralRole: 'admin' }), 'admin_oral')
  })

  it('يوزع الأوزان: إداري كتابي 30 وأهلية 35 وشخصية 35، والتخصص 40 والباقي 20، والعام 100', () => {
    const weights = (applicant) =>
      Object.fromEntries(
        tracksForApplicant(applicant)
          .filter((track) => track.weight != null)
          .map((track) => [track.id, track.weight]),
      )
    const sum = (map) => Object.values(map).reduce((total, weight) => total + weight, 0)

    const admin = weights({ jobTitle: 'إداري' })
    assert.deepEqual(admin, { writing: 30, driving: 35, personality: 35 })
    assert.equal(sum(admin), 100)
    assert.equal(admin.admin_oral, undefined)

    for (const applicant of [
      { jobTitle: 'مبرمج' },
      { jobTitle: 'مهندس شبكات' },
      { jobTitle: 'فني حاسب آلي' },
    ]) {
      const map = weights(applicant)
      const specialty = Object.keys(map).find((id) => ['programming', 'networks', 'maintenance'].includes(id))
      assert.equal(map[specialty], 40)
      assert.equal(map.writing, 20)
      assert.equal(map.driving, 20)
      assert.equal(map.personality, 20)
      assert.equal(sum(map), 100)
    }

    const general = weights({ jobTitle: 'حارس' })
    assert.deepEqual(general, { general: 100 })
  })

  it('يلخّص أصناف المتقدمين مع المسار الشفهي الفعلي', () => {
    const summary = summarizeTracksForApplicants([
      { jobTitle: 'حارس' },
      { jobTitle: 'مبرمج', extra: { 'نوع المقابلة': 'داخلية' } },
      { jobTitle: 'مهندس شبكات', extra: { 'نوع المقابلة': 'داخلية' } },
    ])
    const services = summary.find((s) => s.streamId === 'services')
    const programming = summary.find((s) => s.streamId === 'programming')
    const networks = summary.find((s) => s.streamId === 'networks')
    assert.equal(services?.count, 1)
    assert.ok(services?.tracks.includes('عام'))
    assert.equal(programming?.count, 1)
    assert.ok(programming?.tracks.some((t) => t.includes('برمجة')))
    assert.equal(networks?.count, 1)
    assert.ok(networks?.tracks.some((t) => t.includes('شبكات')))
  })

  it('يبقي المسؤول يرى الجميع', () => {
    const external = { jobTitle: 'مهندس شبكات', extra: { 'نوع المقابلة': 'خارجية' } }
    assert.equal(candidateVisibleToOperator({ role: 'admin' }, external), true)
    assert.equal(candidateVisibleToOperator({ role: 'commander' }, external), true)
  })
})
