export const POLICY_VERSION = 'decision-v2'

export const REQUIRED_CATEGORIES = ['theory', 'oral', 'driving', 'personality']

export const WEIGHTS = Object.freeze({
  theory: 0.25,
  oral: 0.25,
  driving: 0.25,
  personality: 0.25,
})

export const THRESHOLDS = Object.freeze({
  qualifiedComposite: 75,
  conditionalComposite: 65,
  minPerCategory: 60,
})

export const CATEGORY_LABELS_AR = Object.freeze({
  theory: 'عام',
  oral: 'الشفهي',
  driving: 'أهلية القيادة',
  personality: 'تقييم الشخصية',
})

export const STATUS_LABELS_AR = Object.freeze({
  incomplete: 'غير مكتمل',
  qualified: 'مؤهل',
  conditional: 'مشروط',
  not_qualified: 'غير مؤهل',
})

function clampPercent(value, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(100, Math.max(0, num))
}

/** Merge caller thresholds with defaults; keeps qualified >= conditional. */
export function normalizeThresholds(raw = {}) {
  let qualifiedComposite = clampPercent(raw.qualifiedComposite, THRESHOLDS.qualifiedComposite)
  let conditionalComposite = clampPercent(raw.conditionalComposite, THRESHOLDS.conditionalComposite)
  const minPerCategory = clampPercent(raw.minPerCategory, THRESHOLDS.minPerCategory)
  if (qualifiedComposite < conditionalComposite) qualifiedComposite = conditionalComposite
  return { qualifiedComposite, conditionalComposite, minPerCategory }
}

function normalizeWeights(requiredCategories, rawWeights) {
  const weights = {}
  let total = 0
  for (const category of requiredCategories) {
    const value = Number(rawWeights?.[category])
    const w = Number.isFinite(value) && value > 0 ? value : 0
    weights[category] = w
    total += w
  }
  if (total <= 0) {
    const even = 1 / Math.max(1, requiredCategories.length)
    for (const category of requiredCategories) weights[category] = even
    return weights
  }
  for (const category of requiredCategories) weights[category] = weights[category] / total
  return weights
}

/**
 * Pure decision evaluation from category percents (no database).
 * يقبل مسارات مطلوبة وأوزاناً حسب صنف الفرز (خدمي = عام فقط، …).
 * @param {{ categoryPercents?: Record<string, number|null|undefined>, pendingCategories?: string[], requiredCategories?: string[], weights?: Record<string, number>, categoryLabels?: Record<string, string>, thresholds?: object }} input
 */
export function evaluateDecision(input = {}) {
  const categoryPercents = input.categoryPercents || {}
  const pendingCategories = [...new Set((input.pendingCategories || []).filter(Boolean))]
  const requiredCategories = (
    Array.isArray(input.requiredCategories) && input.requiredCategories.length
      ? input.requiredCategories
      : REQUIRED_CATEGORIES
  ).filter(Boolean)
  const labels = { ...CATEGORY_LABELS_AR, ...(input.categoryLabels || {}) }
  const weights = normalizeWeights(requiredCategories, input.weights || WEIGHTS)
  const thresholds = normalizeThresholds(input.thresholds)
  const reasons = []

  const categoryBreakdown = {}
  for (const category of requiredCategories) {
    const raw = categoryPercents[category]
    const percent =
      raw == null || !Number.isFinite(Number(raw)) ? null : Math.round(Number(raw))
    const isPending = pendingCategories.includes(category)
    categoryBreakdown[category] = {
      category,
      labelAr: labels[category] || category,
      percent,
      weight: weights[category],
      status: isPending ? 'pending' : percent == null ? 'missing' : 'completed',
      belowFloor: percent != null && percent < thresholds.minPerCategory,
    }
  }

  const missing = requiredCategories.filter(
    (category) => categoryBreakdown[category].status === 'missing',
  )
  const pending = requiredCategories.filter(
    (category) => categoryBreakdown[category].status === 'pending',
  )

  if (!requiredCategories.length) {
    reasons.push('لا مسارات تقييم لهذا المسمى بعد — صحّح الفرز أولاً.')
    return {
      status: 'incomplete',
      labelAr: STATUS_LABELS_AR.incomplete,
      compositePercent: null,
      weights,
      thresholds,
      categoryBreakdown,
      reasons,
      policyVersion: POLICY_VERSION,
      completedCategories: [],
      pendingCategories: [],
      missingCategories: [],
    }
  }

  if (pending.length || missing.length) {
    if (pending.length) {
      reasons.push(
        `مسارات بانتظار التقييم اليدوي: ${pending.map((c) => labels[c] || c).join('، ')}`,
      )
    }
    if (missing.length) {
      reasons.push(
        `مسارات ناقصة: ${missing.map((c) => labels[c] || c).join('، ')}`,
      )
    }
    reasons.push(
      requiredCategories.length === 1
        ? 'يكتمل القرار بعد توفر نتيجة المسار المطلوب.'
        : `يكتمل القرار بعد توفر نتائج المسارات المطلوبة (${requiredCategories.length}).`,
    )
    return {
      status: 'incomplete',
      labelAr: STATUS_LABELS_AR.incomplete,
      compositePercent: null,
      weights,
      thresholds,
      categoryBreakdown,
      reasons,
      policyVersion: POLICY_VERSION,
      completedCategories: requiredCategories.filter(
        (category) => categoryBreakdown[category].status === 'completed',
      ),
      pendingCategories: pending,
      missingCategories: missing,
    }
  }

  const compositePercent =
    Math.round(
      requiredCategories.reduce(
        (sum, category) => sum + categoryBreakdown[category].percent * weights[category],
        0,
      ) * 10,
    ) / 10

  const belowFloor = requiredCategories.filter(
    (category) => categoryBreakdown[category].belowFloor,
  )
  for (const category of belowFloor) {
    reasons.push(
      `${labels[category] || category} (${categoryBreakdown[category].percent}%) دون عتبة ${thresholds.minPerCategory}%`,
    )
  }

  let status = 'not_qualified'
  if (compositePercent >= thresholds.qualifiedComposite && belowFloor.length === 0) {
    status = 'qualified'
    reasons.push(
      `الدرجة المركّبة ${compositePercent}% بلغت عتبة التأهل (${thresholds.qualifiedComposite}%) وجميع المسارات فوق الحد الأدنى.`,
    )
  } else if (compositePercent >= thresholds.conditionalComposite) {
    status = 'conditional'
    if (belowFloor.length) {
      reasons.push(
        `الدرجة المركّبة ${compositePercent}% ضمن النطاق المشروط مع مسار أو أكثر دون الحد الأدنى.`,
      )
    } else {
      reasons.push(
        `الدرجة المركّبة ${compositePercent}% بين ${thresholds.conditionalComposite}% و${thresholds.qualifiedComposite - 0.1}% — توصية مشروطة.`,
      )
    }
  } else {
    reasons.push(
      `الدرجة المركّبة ${compositePercent}% دون عتبة الشرط (${thresholds.conditionalComposite}%).`,
    )
  }

  return {
    status,
    labelAr: STATUS_LABELS_AR[status],
    compositePercent,
    weights,
    thresholds,
    categoryBreakdown,
    reasons,
    policyVersion: POLICY_VERSION,
    completedCategories: [...requiredCategories],
    pendingCategories: [],
    missingCategories: [],
  }
}
