export const POLICY_VERSION: string
export const REQUIRED_CATEGORIES: string[]
export const WEIGHTS: Record<string, number>
export const THRESHOLDS: {
  qualifiedComposite: number
  conditionalComposite: number
  minPerCategory: number
}
export const CATEGORY_LABELS_AR: Record<string, string>
export const STATUS_LABELS_AR: Record<string, string>
export function normalizeThresholds(raw?: {
  qualifiedComposite?: number
  conditionalComposite?: number
  minPerCategory?: number
}): {
  qualifiedComposite: number
  conditionalComposite: number
  minPerCategory: number
}
export function evaluateDecision(input?: {
  categoryPercents?: Record<string, number | null | undefined>
  pendingCategories?: string[]
  requiredCategories?: string[]
  weights?: Record<string, number>
  categoryLabels?: Record<string, string>
  thresholds?: {
    qualifiedComposite?: number
    conditionalComposite?: number
    minPerCategory?: number
  }
}): {
  status: string
  labelAr: string
  compositePercent: number | null
  weights: Record<string, number>
  thresholds: {
    qualifiedComposite: number
    conditionalComposite: number
    minPerCategory: number
  }
  categoryBreakdown: Record<string, unknown>
  reasons: string[]
  policyVersion: string
  completedCategories: string[]
  pendingCategories: string[]
  missingCategories: string[]
}
