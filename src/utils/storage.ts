import type { ExamAttempt, ExamConfig } from '../data/types'

const EXAMS_KEY = 'exam-platform-exams'
const ATTEMPTS_KEY = 'exam-platform-attempts'

export function saveExam(config: ExamConfig): void {
  const all = listExams()
  all.unshift(config)
  localStorage.setItem(EXAMS_KEY, JSON.stringify(all.slice(0, 50)))
}

export function listExams(): ExamConfig[] {
  try {
    return JSON.parse(localStorage.getItem(EXAMS_KEY) || '[]') as ExamConfig[]
  } catch {
    return []
  }
}

export function getExam(id: string): ExamConfig | undefined {
  return listExams().find((e) => e.id === id)
}

export function saveAttempt(attempt: ExamAttempt): void {
  const all = listAttempts()
  const idx = all.findIndex((a) => a.id === attempt.id)
  if (idx >= 0) all[idx] = attempt
  else all.unshift(attempt)
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all.slice(0, 100)))
}

export function listAttempts(): ExamAttempt[] {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '[]') as ExamAttempt[]
  } catch {
    return []
  }
}
