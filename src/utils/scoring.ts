import { PERSONALITY_REVERSE_IDS } from '../data/banks/personality'
import type { PersonalityResult, Question } from '../data/types'

/** يصحّح الأسئلة الموضوعية فقط — المفتوح/الشفهي لا يدخلان المجموع الآلي */
export function scoreObjectiveExam(
  questions: Question[],
  answers: Record<string, string | number>,
): {
  score: number
  maxScore: number
  needsManualReview: boolean
  details: { id: string; correct: boolean | null; points: number }[]
} {
  let score = 0
  let maxScore = 0
  let needsManualReview = false
  const details: { id: string; correct: boolean | null; points: number }[] = []

  for (const q of questions) {
    if (q.type === 'open' || q.type === 'oral' || q.type === 'scale') {
      needsManualReview = true
      details.push({ id: q.id, correct: null, points: 0 })
      continue
    }

    maxScore += q.points
    const ans = String(answers[q.id] ?? '')
    const correct = ans === String(q.correctAnswer ?? '')
    if (correct) score += q.points
    details.push({ id: q.id, correct, points: correct ? q.points : 0 })
  }

  return { score, maxScore, needsManualReview, details }
}

export function scorePersonality(
  questions: Question[],
  answers: Record<string, string | number>,
): PersonalityResult {
  const traitMap = new Map<string, { sum: number; count: number }>()

  for (const q of questions) {
    if (!q.trait) continue
    const raw = Number(answers[q.id] ?? 3)
    const reverse = typeof q.reverse === 'boolean' ? q.reverse : PERSONALITY_REVERSE_IDS.has(q.id)
    const value = reverse ? 6 - raw : raw
    const cur = traitMap.get(q.trait) ?? { sum: 0, count: 0 }
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
  let summary = 'ملف شخصي متوازن نسبياً مع نقاط قوة متفاوتة حسب المحاور.'
  if (avg >= 75) summary = 'نتائج مرتفعة عموماً في السمات المقاسة — يظهر استعداد جيد للتفاعل والإنجاز.'
  else if (avg <= 40) summary = 'نتائج منخفضة نسبياً في بعض المحاور — يُفضل التركيز على تطوير نقاط محددة.'

  const top = [...traits].sort((a, b) => b.percent - a.percent)[0]
  const low = [...traits].sort((a, b) => a.percent - b.percent)[0]
  if (top && low) {
    summary += ` أبرز محور: ${top.name} (${top.percent}%). محور يحتاج انتباهاً: ${low.name} (${low.percent}%).`
  }

  return { traits, summary }
}
