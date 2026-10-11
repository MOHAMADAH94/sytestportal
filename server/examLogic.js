/** تصحيح تلقائي على السيرفر — لا يُرجع للممتحن */

function isPersonalityReverse(q) {
  if (typeof q.reverse === 'boolean') return q.reverse
  const m = String(q.id || '').match(/^pe-(\d+)$/)
  if (m) return Number(m[1]) % 2 === 0
  return false
}

export function isMcqCorrect(correctAnswer, candidateAnswer) {
  if (Array.isArray(correctAnswer)) {
    const expected = [...new Set(correctAnswer.map((s) => String(s ?? '').trim()).filter(Boolean))].sort()
    const given = (Array.isArray(candidateAnswer) ? candidateAnswer : [candidateAnswer])
      .map((s) => String(s ?? '').trim())
      .filter(Boolean)
    const givenSet = [...new Set(given)].sort()
    if (expected.length === 0 || expected.length !== givenSet.length) return false
    return expected.every((val, idx) => val === givenSet[idx])
  }
  const expected = String(correctAnswer ?? '').trim()
  if (Array.isArray(candidateAnswer)) {
    return candidateAnswer.length === 1 && String(candidateAnswer[0] ?? '').trim() === expected
  }
  return String(candidateAnswer ?? '').trim() === expected
}

export function scorePersonality(questions, answers) {
  const traitMap = new Map()

  for (const q of questions) {
    if (!q.trait) continue
    const raw = Number(answers[q.id] ?? 3)
    const value = isPersonalityReverse(q) ? 6 - raw : raw
    const cur = traitMap.get(q.trait) || { sum: 0, count: 0 }
    cur.sum += value
    cur.count += 1
    traitMap.set(q.trait, cur)
  }

  const traits = [...traitMap.entries()].map(([name, { sum, count }]) => {
    const max = count * 5
    const percent = Math.round((sum / max) * 100)
    return { name, score: sum, max, percent }
  })

  const avg = traits.length ? traits.reduce((a, t) => a + t.percent, 0) / traits.length : 0
  let summary = 'ملف شخصي متوازن نسبياً.'
  if (avg >= 75) summary = 'نتائج مرتفعة عموماً في السمات المقاسة.'
  else if (avg <= 40) summary = 'نتائج منخفضة نسبياً في بعض المحاور.'

  const top = [...traits].sort((a, b) => b.percent - a.percent)[0]
  const low = [...traits].sort((a, b) => a.percent - b.percent)[0]
  if (top && low) {
    summary += ` أبرز محور: ${top.name} (${top.percent}%). محور يحتاج انتباهاً: ${low.name} (${low.percent}%).`
  }

  return { traits, summary }
}

export function scoreAnswers(questions, answers) {
  if (questions.length > 0 && questions.every((q) => q.type === 'scale' && q.trait)) {
    const personality = scorePersonality(questions, answers)
    const avg =
      personality.traits.length > 0
        ? personality.traits.reduce((a, t) => a + t.percent, 0) / personality.traits.length
        : 0
    return {
      score: Math.round(avg),
      maxScore: 100,
      personality,
      needsManualReview: false,
      correctCount: null,
      objectiveCount: null,
      questionEvaluations: questions.map((q) => ({
        questionId: q.id,
        type: q.type,
        text: q.text,
        points: q.points || 1,
        candidateAnswer: answers[q.id] ?? 3,
        status: 'evaluated',
        awardedScore: null,
        isCorrect: null,
      })),
    }
  }

  let score = 0
  let maxScore = 0
  let correctCount = 0
  let objectiveCount = 0
  let needsManualReview = false
  const questionEvaluations = []

  for (const q of questions) {
    const isManual = q.type === 'open' || q.type === 'oral' || q.type === 'classic' || q.type === 'scale'
    const qPoints = Number.isFinite(Number(q.points)) && Number(q.points) > 0 ? Number(q.points) : 1
    const candAnswer = answers[q.id]

    if (isManual) {
      needsManualReview = true
      questionEvaluations.push({
        questionId: q.id,
        type: q.type,
        text: q.text,
        points: qPoints,
        candidateAnswer: candAnswer ?? '',
        answerKey: q.answerKey || '',
        rubric: q.rubric || [],
        explanation: q.explanation || null,
        awardedScore: null,
        isCorrect: null,
        status: 'pending_evaluation',
        evaluatorNotes: '',
      })
      continue
    }

    objectiveCount += 1
    maxScore += qPoints
    const isCorrect = isMcqCorrect(q.correctAnswer, candAnswer)
    const awarded = isCorrect ? qPoints : 0
    if (isCorrect) {
      score += qPoints
      correctCount += 1
    }

    questionEvaluations.push({
      questionId: q.id,
      type: q.type || 'mcq',
      text: q.text,
      points: qPoints,
      candidateAnswer: candAnswer ?? '',
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || null,
      awardedScore: awarded,
      isCorrect,
      status: 'evaluated',
      evaluatorNotes: '',
    })
  }

  if (maxScore === 0 && needsManualReview) {
    return {
      score: 0,
      maxScore: 0,
      personality: null,
      needsManualReview: true,
      correctCount: 0,
      objectiveCount: 0,
      questionEvaluations,
    }
  }

  return {
    score,
    maxScore,
    personality: null,
    needsManualReview,
    correctCount,
    objectiveCount,
    questionEvaluations,
  }
}

/** تطبيق التقييم اليدوي للأسئلة الكلاسيكية/المقالية */
export function applyManualEvaluation(questions, existingEvaluations = [], manualScores = []) {
  let evalMap
  if (Array.isArray(manualScores)) {
    evalMap = new Map(manualScores.map((item) => [item.questionId, item]))
  } else if (manualScores && typeof manualScores === 'object') {
    evalMap = new Map(
      Object.entries(manualScores).map(([qId, val]) => [
        qId,
        typeof val === 'object' && val !== null
          ? { questionId: qId, awardedScore: val.awardedScore ?? val.score, feedback: val.feedback }
          : { questionId: qId, awardedScore: val },
      ]),
    )
  } else {
    evalMap = new Map()
  }
  const updatedEvaluations = []
  let totalScore = 0
  let totalMaxScore = 0
  let pendingCount = 0
  let correctCount = 0
  let objectiveCount = 0

  for (const q of questions) {
    const qPoints = Number.isFinite(Number(q.points)) && Number(q.points) > 0 ? Number(q.points) : 1
    totalMaxScore += qPoints

    const isManual = q.type === 'open' || q.type === 'oral' || q.type === 'classic' || q.type === 'scale'
    const prev = existingEvaluations.find((e) => e.questionId === q.id)
    const manual = evalMap.get(q.id)

    if (isManual) {
      if (manual && manual.awardedScore != null && Number.isFinite(Number(manual.awardedScore))) {
        const rawScore = Number(manual.awardedScore)
        const clampedScore = Math.max(0, Math.min(qPoints, rawScore))
        totalScore += clampedScore
        updatedEvaluations.push({
          ...(prev || {}),
          questionId: q.id,
          type: q.type,
          text: q.text,
          points: qPoints,
          candidateAnswer: prev?.candidateAnswer ?? '',
          answerKey: q.answerKey || '',
          explanation: q.explanation || null,
          awardedScore: clampedScore,
          isCorrect: clampedScore === qPoints,
          status: 'evaluated',
          evaluatorNotes: String(manual.feedback || manual.evaluatorNotes || '').trim(),
          feedback: String(manual.feedback || manual.evaluatorNotes || '').trim(),
          evaluatedBy: manual.evaluator || prev?.evaluatedBy || 'admin',
          evaluatedAt: new Date().toISOString(),
        })
      } else if (prev && prev.status === 'evaluated' && prev.awardedScore != null) {
        totalScore += prev.awardedScore
        updatedEvaluations.push(prev)
      } else {
        pendingCount += 1
        updatedEvaluations.push({
          ...(prev || {}),
          questionId: q.id,
          type: q.type,
          text: q.text,
          points: qPoints,
          candidateAnswer: prev?.candidateAnswer ?? '',
          answerKey: q.answerKey || '',
          explanation: q.explanation || null,
          awardedScore: null,
          isCorrect: null,
          status: 'pending_evaluation',
          evaluatorNotes: '',
        })
      }
    } else {
      objectiveCount += 1
      const awarded = prev?.awardedScore ?? 0
      totalScore += awarded
      if (prev?.isCorrect) correctCount += 1
      updatedEvaluations.push(prev || {
        questionId: q.id,
        type: q.type || 'mcq',
        text: q.text,
        points: qPoints,
        candidateAnswer: prev?.candidateAnswer ?? '',
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || null,
        awardedScore: awarded,
        isCorrect: !!prev?.isCorrect,
        status: 'evaluated',
      })
    }
  }

  const needsManualReview = pendingCount > 0
  const evaluationStatus = needsManualReview ? 'pending' : 'completed'
  const percent = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100 * 10) / 10 : 0

  return {
    score: totalScore,
    maxScore: totalMaxScore,
    percent,
    needsManualReview,
    evaluationStatus,
    pendingCount,
    correctCount,
    objectiveCount,
    evaluations: updatedEvaluations,
    questionEvaluations: updatedEvaluations,
  }
}

/** إعادة احتساب إحصاءات محاولة من الإجابات المحفوظة */
export function summarizeAttempt(questions, answersJson, score, maxScore) {
  let answers = {}
  try {
    answers = typeof answersJson === 'string' ? JSON.parse(answersJson || '{}') : answersJson || {}
  } catch {
    answers = {}
  }
  const scored = scoreAnswers(questions, answers)
  return {
    score: score ?? scored.score,
    maxScore: maxScore ?? scored.maxScore,
    percent:
      maxScore || scored.maxScore
        ? Math.round(((score ?? scored.score) / (maxScore || scored.maxScore)) * 100)
        : null,
    correctCount: scored.correctCount,
    objectiveCount: scored.objectiveCount,
    personality: scored.personality,
    questionEvaluations: scored.questionEvaluations,
  }
}
