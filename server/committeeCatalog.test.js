import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ACCESS_ACCOUNTS } from './accessAccounts.js'
import {
  CLASSIFICATION_RULES,
  COMMITTEE_ACCOUNTS,
  COMMITTEE_LANES,
  RETIRED_ACCESS_USERNAMES,
} from '../shared/committeeCatalog.js'
import { EVALUATION_STREAMS, EVALUATION_TRACKS, tracksForApplicant } from '../shared/evaluationMatrix.js'

describe('committeeCatalog — جداول اللجان والتصنيفات', () => {
  it('يحذف الحسابات التي لا تختبر أحداً', () => {
    const usernames = ACCESS_ACCOUNTS.map((account) => account.username)
    for (const retired of RETIRED_ACCESS_USERNAMES) {
      assert.equal(usernames.includes(retired), false, retired)
    }
    assert.deepEqual([...RETIRED_ACCESS_USERNAMES], ['oral_sys', 'oral_adm'])
    assert.equal(COMMITTEE_LANES.some((lane) => lane.username === 'oral_sys' || lane.username === 'oral_adm'), false)
  })

  it('يربط كل اختبار تصنيف بحساب لجنة موجود', () => {
    const accountForTrack = {
      general: 'theory',
      writing: 'office',
      driving: 'driving',
      personality: 'personality',
      programming: 'oral_prog',
      networks: 'oral_net',
      maintenance: 'oral_tech',
    }
    const byUser = new Map(COMMITTEE_ACCOUNTS.map((account) => [account.username, account]))
    for (const rule of Object.values(CLASSIFICATION_RULES)) {
      assert.equal(EVALUATION_STREAMS[rule.id].label, rule.label)
      assert.deepEqual(EVALUATION_STREAMS[rule.id].tracks, [...rule.examTrackIds, 'security'])
      for (const trackId of rule.examTrackIds) {
        assert.ok(EVALUATION_TRACKS[trackId], trackId)
        const username = accountForTrack[trackId]
        assert.ok(byUser.has(username), trackId)
        assert.equal(rule.examTrackIds.includes('admin_oral'), false)
      }
      if (rule.weights) {
        const sum = Object.values(rule.weights).reduce((total, weight) => total + weight, 0)
        assert.equal(sum, 100)
        assert.deepEqual(Object.keys(rule.weights), [...rule.examTrackIds])
      }
    }
    assert.equal(byUser.has('military_security'), true)
    assert.equal(COMMITTEE_LANES.find((lane) => lane.username === 'military_security').toCommittee, false)
  })

  it('يفرز كل تصنيف إلى اختباراته فقط', () => {
    const cases = [
      ['حارس', 'services', ['general']],
      ['إداري', 'administrative', ['writing', 'driving', 'personality']],
      ['مبرمج', 'programming', ['writing', 'personality', 'driving', 'programming']],
      ['مهندس شبكات', 'networks', ['writing', 'personality', 'driving', 'networks']],
      ['فني حاسب آلي', 'maintenance', ['writing', 'personality', 'driving', 'maintenance']],
    ]
    for (const [title, streamId, exams] of cases) {
      const ids = tracksForApplicant({ jobTitle: title })
        .filter((track) => track.category !== 'security')
        .map((track) => track.id)
      assert.equal(EVALUATION_STREAMS[streamId].id, streamId)
      assert.deepEqual(ids, exams, title)
      assert.equal(ids.includes('admin_oral'), false)
    }
  })
})
