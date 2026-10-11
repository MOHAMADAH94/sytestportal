import type { ExamCategory, ExamLevel, OralRole, Question } from '../types'
import { drivingBank } from './driving'
import { oralBank } from './oral'
import { personalityBank } from './personality'
import { theoryBank } from './theory'

const CUSTOM_KEY = 'exam-platform-custom-questions'

const ENGINEER_ORAL: OralRole[] = [
  'programmer',
  'network_engineer',
  'systems_engineer',
  'admin',
]

export function loadCustomQuestions(): Question[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Question[]
  } catch {
    return []
  }
}

export function saveCustomQuestion(question: Question): void {
  const all = loadCustomQuestions()
  all.push(question)
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(all))
}

export function deleteCustomQuestion(id: string): void {
  const all = loadCustomQuestions().filter((q) => q.id !== id)
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(all))
}

export function getAllQuestions(): Question[] {
  return [...theoryBank, ...oralBank, ...drivingBank, ...personalityBank, ...loadCustomQuestions()]
}

export function matchesLevel(q: Question, level?: ExamLevel): boolean {
  if (!level) return true
  if (q.level === 'both' || q.level === level) return true
  if (q.level) return false

  if (q.category === 'oral') {
    if (level === 'technician') return q.role === 'technician'
    return !!q.role && ENGINEER_ORAL.includes(q.role)
  }

  if (level === 'technician') return q.difficulty !== 'hard'
  return q.difficulty !== 'easy'
}

export function getBank(category: ExamCategory, role?: OralRole, level?: ExamLevel): Question[] {
  return getAllQuestions().filter((q) => {
    if (q.category !== category) return false
    if (!matchesLevel(q, level)) return false
    if (category === 'oral' && role) return q.role === role
    if (category === 'oral' && level === 'technician') return q.role === 'technician'
    if (category === 'oral' && level === 'engineer') {
      return !!q.role && ENGINEER_ORAL.includes(q.role)
    }
    return true
  })
}

export function getTopics(category: ExamCategory, role?: OralRole, level?: ExamLevel): string[] {
  const topics = new Set(getBank(category, role, level).map((q) => q.topic))
  return [...topics].sort((a, b) => a.localeCompare(b, 'ar'))
}

export function getQuestionById(id: string): Question | undefined {
  return getAllQuestions().find((q) => q.id === id)
}
