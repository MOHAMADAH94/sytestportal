import { randomInt } from 'node:crypto'
import { JOB_PROFILES, JOB_LEVELS, DIFFICULTIES } from '../shared/jobProfiles.js'

export function matchingPool(bank, category, config) {
  const profile = JOB_PROFILES.find((item) => item.id === config.profileId)
  if (!profile) throw new Error('المسمى غير مدعوم؛ حدّد تصنيفًا وظيفيًا مناسبًا أو وسّع البنك أولًا')
  if (config.specialty !== profile.specialty) throw new Error('الاختصاص لا يطابق المسمى الوظيفي')
  if (!JOB_LEVELS.some((item) => item.id === config.jobLevel)) throw new Error('المستوى الوظيفي غير صالح')
  if (config.difficulty !== 'mixed' && !DIFFICULTIES.some((item) => item.id === config.difficulty)) throw new Error('درجة الصعوبة غير صالحة')
  if (!Number.isInteger(config.questionCount) || config.questionCount < 1 || config.questionCount > 100) throw new Error('عدد الأسئلة يجب أن يكون من 1 إلى 100')
  if (typeof config.includeShared !== 'boolean') throw new Error('حدّد السماح بالأسئلة المشتركة')
  if (config.skills !== undefined && (!Array.isArray(config.skills) || config.skills.some((item) => typeof item !== 'string'))) throw new Error('المهارات غير صالحة')
  if (config.questionTypes !== undefined && (!Array.isArray(config.questionTypes) || config.questionTypes.some((item) => !['mcq', 'true_false', 'open', 'oral', 'scale', 'classic'].includes(item)))) throw new Error('أنواع الأسئلة غير صالحة')
  const ids = new Set(), texts = new Set()
  const requestedTypes = config.questionTypes?.length ? config.questionTypes : category === 'personality' ? ['scale'] : null
  return bank.filter((q) => {
    if (q.category !== category || !q.jobLevels?.includes(config.jobLevel)) return false
    if (config.difficulty !== 'mixed' && q.difficulty !== config.difficulty) return false
    if (q.isShared === true) { if (!config.includeShared) return false }
    else if (profile.id === 'unclassified' || q.isShared !== false || !q.jobTitles?.includes(profile.id) || !q.specialties?.includes(config.specialty)) return false
    if (config.skills?.length && !config.skills.includes(q.skill || q.topic)) return false
    if (requestedTypes && !requestedTypes.includes(q.type)) return false
    const text = q.text.trim().replace(/\s+/g, ' ')
    if (ids.has(q.id) || texts.has(text)) return false
    ids.add(q.id); texts.add(text)
    return true
  })
}

function mergePools(...pools) {
  const ids = new Set(), texts = new Set(), out = []
  for (const pool of pools) {
    for (const q of pool) {
      const text = q.text.trim().replace(/\s+/g, ' ')
      if (ids.has(q.id) || texts.has(text)) continue
      ids.add(q.id); texts.add(text); out.push(q)
    }
  }
  return out
}

/**
 * Resolve a bank pool that stays tied to the job title/specialty.
 * Soft filters (skills / difficulty / level) may widen, but questions never switch to another job.
 * Shared questions are only added as a top-up after specialty questions.
 */
export function resolveBankPool(bank, category, config, { allowSharedTopUp = true } = {}) {
  const profile = JOB_PROFILES.find((item) => item.id === config.profileId)
  if (!profile) throw new Error('المسمى غير مدعوم؛ حدّد تصنيفًا وظيفيًا مناسبًا أو وسّع البنك أولًا')
  const requested = Math.max(1, Math.min(100, Number(config.questionCount) || 20))
  const base = {
    profileId: config.profileId,
    specialty: profile.specialty,
    jobLevel: config.jobLevel,
    difficulty: config.difficulty || 'mixed',
    questionCount: requested,
    skills: Array.isArray(config.skills) ? config.skills : [],
    questionTypes: Array.isArray(config.questionTypes) ? config.questionTypes : [],
    includeShared: false,
  }

  const specialtyAttempts = []
  const pushSpecialty = (patch, note) => specialtyAttempts.push({ ...base, ...patch, _note: note })
  pushSpecialty({
    includeShared: false,
    skills: base.skills,
    difficulty: base.difficulty,
    jobLevel: base.jobLevel,
  }, 'exact_specialty')
  if (base.skills.length) pushSpecialty({ skills: [] }, 'specialty_clear_skills')
  if (base.difficulty !== 'mixed') pushSpecialty({ skills: [], difficulty: 'mixed' }, 'specialty_mixed_difficulty')
  for (const level of JOB_LEVELS) {
    if (level.id === base.jobLevel) continue
    pushSpecialty({ skills: [], difficulty: 'mixed', jobLevel: level.id }, 'specialty_level_' + level.id)
  }

  let specialty = { pool: [], config: { ...base }, note: 'exact_specialty' }
  for (const attempt of specialtyAttempts) {
    const { _note, ...clean } = attempt
    try {
      const pool = matchingPool(bank, category, clean)
      if (pool.length > specialty.pool.length) specialty = { pool, config: clean, note: _note }
      if (pool.length >= requested) {
        return {
          pool,
          config: {
            ...config,
            ...clean,
            includeShared: false,
            questionCount: requested,
            bankRelaxed: _note !== 'exact_specialty',
            bankRelaxNote: _note,
          },
          relaxed: _note !== 'exact_specialty',
          note: _note,
        }
      }
    } catch {
      // skip invalid attempt
    }
  }

  const canUseShared = allowSharedTopUp && (
    config.includeShared === true ||
    profile.id === 'unclassified' ||
    ['driving', 'personality'].includes(category)
  )

  if (!canUseShared || specialty.pool.length >= requested) {
    return {
      pool: specialty.pool,
      config: {
        ...config,
        ...specialty.config,
        includeShared: false,
        questionCount: requested,
        bankRelaxed: specialty.note !== 'exact_specialty',
        bankRelaxNote: specialty.note,
      },
      relaxed: specialty.note !== 'exact_specialty',
      note: specialty.note,
    }
  }

  // Top-up with shared only — never questions belonging to another job title.
  const sharedConfig = {
    ...specialty.config,
    includeShared: true,
    skills: [],
    difficulty: 'mixed',
    questionCount: requested,
  }
  let sharedPool = []
  try {
    sharedPool = matchingPool(bank, category, sharedConfig).filter((q) => q.isShared === true)
  } catch {
    sharedPool = []
  }
  const pool = mergePools(specialty.pool, sharedPool)
  return {
    pool,
    config: {
      ...config,
      ...sharedConfig,
      includeShared: true,
      includeSharedTopUp: true,
      questionCount: requested,
      bankRelaxed: true,
      bankRelaxNote: specialty.pool.length ? 'specialty_plus_shared' : 'shared_only',
    },
    relaxed: true,
    note: specialty.pool.length ? 'specialty_plus_shared' : 'shared_only',
  }
}

const cellKey = (q) => `${q.skill || q.topic}\u0000${q.difficulty}`
export function buildBlueprint(pool, count) {
  if (count <= 0) return []
  if (!pool.length) throw new Error('لا أسئلة في البنك لهذه المجموعة')
  if (pool.length < count) throw new Error(`الأسئلة المناسبة غير كافية: المتاح ${pool.length} والمطلوب ${count}`)
  const cells = new Map()
  for (const q of pool) {
    const key = cellKey(q)
    if (!cells.has(key)) cells.set(key, { key, skill: q.skill || q.topic, difficulty: q.difficulty, available: 0, count: 0 })
    cells.get(key).available++
  }
  const skills = new Map(), difficulties = new Map()
  for (let i = 0; i < count; i++) {
    const selected = [...cells.values()].filter((cell) => cell.count < cell.available).sort((a, b) =>
      (skills.get(a.skill) || 0) - (skills.get(b.skill) || 0) ||
      (difficulties.get(a.difficulty) || 0) - (difficulties.get(b.difficulty) || 0) ||
      a.count - b.count || a.key.localeCompare(b.key))[0]
    selected.count++
    skills.set(selected.skill, (skills.get(selected.skill) || 0) + 1)
    difficulties.set(selected.difficulty, (difficulties.get(selected.difficulty) || 0) + 1)
  }
  return [...cells.values()].filter((cell) => cell.count).map(({ key, skill, difficulty, count: quantity }) => ({ key, skill, difficulty, count: quantity }))
}

function shuffle(items, random = (n) => randomInt(n)) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) { const j = random(i + 1); [copy[i], copy[j]] = [copy[j], copy[i]] }
  return copy
}

/** Prefer job-specific questions over shared fillers when picking within a blueprint cell. */
export function selectQuestions(pool, blueprint, seen = new Set(), usage = new Map(), random) {
  const selected = []
  for (const cell of blueprint) {
    const candidates = shuffle(pool.filter((q) => cellKey(q) === cell.key), random)
      .sort((a, b) =>
        Number(a.isShared === true) - Number(b.isShared === true) ||
        Number(seen.has(a.id)) - Number(seen.has(b.id)) ||
        (usage.get(a.id) || 0) - (usage.get(b.id) || 0))
    if (candidates.length < cell.count) throw new Error('تغيرت تغطية البنك؛ أعد مراجعة إعدادات المجموعة')
    for (const question of candidates.slice(0, cell.count)) {
      usage.set(question.id, (usage.get(question.id) || 0) + 1)
      selected.push({ ...question, ...(question.choices ? { choices: shuffle(question.choices, random) } : {}) })
    }
  }
  return { questions: shuffle(selected, random), reusedCount: selected.filter((q) => seen.has(q.id)).length }
}

/**
 * يختار العدد المطلوب تماماً. إن نقص البنك يُعاد استخدام الأسئلة (بين المتقدمين أو داخل المجموعة)
 * بدل تقليص العدد — حتى يتساوى الجميع على نفس العدد المختار.
 */
export function selectQuestionSet(pool, count, seen = new Set(), usage = new Map(), random) {
  const target = Math.max(0, Math.floor(Number(count)) || 0)
  if (target <= 0) return { questions: [], reusedCount: 0, padded: false }
  if (!pool.length) return { questions: [], reusedCount: 0, padded: false }
  const uniqueTarget = Math.min(pool.length, target)
  const blueprint = buildBlueprint(pool, uniqueTarget)
  const base = selectQuestions(pool, blueprint, seen, usage, random)
  if (base.questions.length >= target) return { ...base, padded: false }

  const questions = [...base.questions]
  let copy = 0
  while (questions.length < target) {
    const next = shuffle([...pool], random).sort(
      (a, b) => (usage.get(a.id) || 0) - (usage.get(b.id) || 0) || Number(a.isShared === true) - Number(b.isShared === true),
    )[0]
    copy += 1
    usage.set(next.id, (usage.get(next.id) || 0) + 1)
    questions.push({
      ...next,
      id: `${next.id}#${copy}`,
      sourceId: next.id,
      ...(next.choices ? { choices: shuffle(next.choices, random) } : {}),
    })
  }
  return {
    questions: shuffle(questions, random),
    reusedCount: questions.filter((q) => seen.has(q.sourceId || q.id)).length,
    padded: true,
  }
}

export function assertQuestionsMatchJob(questions, profileId, specialty, { allowShared = false } = {}) {
  for (const q of questions) {
    if (q.isShared === true) {
      if (!allowShared) throw new Error('سؤال مشترك غير مسموح لهذه المجموعة')
      continue
    }
    if (!q.jobTitles?.includes(profileId) || !q.specialties?.includes(specialty)) {
      throw new Error('سؤال خارج المسمى الوظيفي للمجموعة')
    }
  }
}
