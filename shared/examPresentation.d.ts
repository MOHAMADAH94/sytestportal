export function questionTypesFromConfig(config: { groups?: Array<{ questionTypes?: string[] }> } | null | undefined): string[]
export function questionTypesFromQuestions(questions: Array<{ type?: string }> | null | undefined): string[]
export function isObjectiveExam(questionTypes: string[] | null | undefined): boolean
export function isWrittenQuestionExam(questionTypes: string[] | null | undefined): boolean
export function resolveExamTheoryTrack(input?: {
  category?: string | null
  theoryTrack?: string | null
  ownerUsername?: string | null
}): 'office' | 'general' | null
export function showsEntryBarcode(input?: {
  category?: string | null
  theoryTrack?: string | null
  questionTypes?: string[] | null
  evaluationMode?: string | null
}): boolean
export function objectiveScoreReveal(
  questions: Array<{ type?: string }> | null | undefined,
  scored: { score?: number; maxScore?: number; needsManualReview?: boolean } | null | undefined,
): { revealScore: true; score: number; maxScore: number; percent: number } | null
