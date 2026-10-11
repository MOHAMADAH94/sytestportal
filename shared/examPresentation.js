const OBJECTIVE_TYPES = new Set(['mcq', 'true_false'])
const WRITTEN_TYPES = new Set(['open', 'classic'])

export function questionTypesFromConfig(config) {
  const types = []
  for (const group of config?.groups || []) {
    for (const type of group.questionTypes || []) {
      if (type && !types.includes(type)) types.push(type)
    }
  }
  return types
}

export function questionTypesFromQuestions(questions) {
  const types = []
  for (const question of questions || []) {
    if (question?.type && !types.includes(question.type)) types.push(question.type)
  }
  return types
}

export function isObjectiveExam(questionTypes) {
  const types = questionTypes || []
  return types.length > 0 && types.every((type) => OBJECTIVE_TYPES.has(type))
}

export function isWrittenQuestionExam(questionTypes) {
  const types = questionTypes || []
  return types.length > 0 && types.every((type) => WRITTEN_TYPES.has(type))
}

export function resolveExamTheoryTrack({ category, theoryTrack, ownerUsername } = {}) {
  if (category && category !== 'theory') return null
  if (theoryTrack === 'office' || theoryTrack === 'general') return theoryTrack
  const owner = String(ownerUsername || '').toLowerCase()
  if (owner === 'office') return 'office'
  if (owner === 'theory' || owner === 'theory2') return 'general'
  return null
}

/**
 * الباركود بطاقة دخول مطبوعة.
 * يظهر للاختبار الكتابي (مسار office أو أسئلة مقالية)،
 * ولاختبارات يدخلها الممتحن بنفسه (العام، أو وضع QR).
 * الشفهي والمقابلة اليدوية لا يحتاجان باركوداً.
 */
export function showsEntryBarcode({ category, theoryTrack, questionTypes, evaluationMode } = {}) {
  if (theoryTrack === 'office' || isWrittenQuestionExam(questionTypes)) return true
  if (category === 'theory') return true
  if (evaluationMode === 'qr') return true
  return false
}

export function objectiveScoreReveal(questions, scored) {
  const types = questionTypesFromQuestions(questions)
  if (!isObjectiveExam(types)) return null
  const maxScore = Number(scored?.maxScore)
  const score = Number(scored?.score)
  if (scored?.needsManualReview || !(maxScore > 0) || !Number.isFinite(score)) return null
  const percent = Math.round((score / maxScore) * 100)
  return {
    revealScore: true,
    score,
    maxScore,
    percent,
  }
}
