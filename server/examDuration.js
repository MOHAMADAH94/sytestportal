const DEFAULT_SECONDS = Object.freeze({ theory: 60, oral: 300, driving: 300, personality: 90 })

export function secondsPerQuestion(category, environment = process.env) {
  const key = `EXAM_SECONDS_PER_QUESTION_${String(category || '').toUpperCase()}`
  const configured = Number(environment[key] || environment.EXAM_SECONDS_PER_QUESTION)
  const value = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SECONDS[category] || 180
  return Math.max(30, Math.min(1800, Math.floor(value)))
}

/**
 * مدة الاختبار بالمللي ثانية.
 * إن وُجد durationMinutes في الخيارات يُعتمد كوقت إجمالي، وإلا ثوانٍ لكل سؤال × العدد.
 */
export function examDurationMs(category, questionCount, environment = process.env, options = {}) {
  const minutes = Number(options?.durationMinutes)
  if (Number.isFinite(minutes) && minutes > 0) {
    return Math.max(1, Math.min(600, Math.floor(minutes))) * 60 * 1000
  }
  const perQ = Number(options?.secondsPerQuestion)
  const seconds = Number.isFinite(perQ) && perQ > 0
    ? Math.max(30, Math.min(1800, Math.floor(perQ)))
    : secondsPerQuestion(category, environment)
  const count = Math.max(1, Math.floor(Number(questionCount)) || 1)
  return seconds * count * 1000
}

/** ثوانٍ لكل سؤال للعرض في الواجهة — مشتقة من المدة الإجمالية إن وُجدت */
export function effectiveSecondsPerQuestion(category, questionCount, settings = null, environment = process.env) {
  const minutes = Number(settings?.durationMinutes)
  const count = Math.max(1, Math.floor(Number(questionCount)) || 1)
  if (Number.isFinite(minutes) && minutes > 0) {
    return Math.max(30, Math.floor((Math.min(600, Math.floor(minutes)) * 60) / count))
  }
  const perQ = Number(settings?.secondsPerQuestion)
  if (Number.isFinite(perQ) && perQ > 0) {
    return Math.max(30, Math.min(1800, Math.floor(perQ)))
  }
  return secondsPerQuestion(category, environment)
}
