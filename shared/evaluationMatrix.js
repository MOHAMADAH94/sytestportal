/**
 * فرز الاختبارات حسب جدول التصنيفات في committeeCatalog.js.
 * خدمي: عام فقط.
 * اداري: كتابي 30 + أهلية 35 + شخصية 35.
 * برمجيات / شبكات / فني: التخصص 40، والكتابي والشخصية والأهلية 20 لكل منها.
 * الأمن العسكري مراجعة لكل التصنيفات، بلا وزن.
 * مسار التخصص واحد فقط: برمجة أو شبكات أو فني.
 */
import { effectiveJobTitle, resolveJobProfile, canonicalOralRole, normalizeTitle } from './jobProfiles.js'
import { CLASSIFICATION_RULES } from './committeeCatalog.js'

/** مسارات التقييم المعتمدة في المصفوفة */
export const EVALUATION_TRACKS = Object.freeze({
  general: { id: 'general', label: 'عام', weight: 100, category: 'theory', theoryTrack: 'general' },
  personality: { id: 'personality', label: 'شخصية', weight: 20, category: 'personality' },
  driving: { id: 'driving', label: 'أهلية قيادة', weight: 20, category: 'driving' },
  writing: { id: 'writing', label: 'اختبار كتابي', weight: 20, category: 'theory', theoryTrack: 'office' },
  admin_oral: { id: 'admin_oral', label: 'شفهي إداري', weight: 40, category: 'oral', oralRoles: ['admin'] },
  maintenance: { id: 'maintenance', label: 'فني', weight: 40, category: 'oral', oralRoles: ['technician', 'technical_trades', 'services', 'engineering_trades'] },
  programming: { id: 'programming', label: 'برمجة', weight: 40, category: 'oral', oralRoles: ['programmer', 'systems_engineer'] },
  networks: { id: 'networks', label: 'شبكات', weight: 40, category: 'oral', oralRoles: ['network_engineer'] },
  security: { id: 'security', label: 'أمن عسكري', weight: null, category: 'security' },
})

/** مسارات التخصص الشفهي — مسار واحد فقط لكل متقدم، بلا شفهي إداري */
export const ORAL_SPECIALTY_TRACKS = Object.freeze(['maintenance', 'programming', 'networks'])

/** الإداري ثلاثة اختبارات: كتابي 30، أهلية 35، شخصية 35. */
const ADMINISTRATIVE_WEIGHTS = CLASSIFICATION_RULES.administrative.weights

function streamFromRule(rule) {
  return Object.freeze({
    id: rule.id,
    label: rule.label,
    tracks: Object.freeze([...rule.examTrackIds, 'security']),
  })
}

/**
 * صفوف الفرز مشتقة من جدول التصنيفات.
 * الأمن العسكري يُضاف مراجعةً لكل صنف معروف.
 */
export const EVALUATION_STREAMS = Object.freeze({
  services: streamFromRule(CLASSIFICATION_RULES.services),
  administrative: streamFromRule(CLASSIFICATION_RULES.administrative),
  programming: streamFromRule(CLASSIFICATION_RULES.programming),
  networks: streamFromRule(CLASSIFICATION_RULES.networks),
  maintenance: streamFromRule(CLASSIFICATION_RULES.maintenance),
})

/** تسميات فروع الشفهي عند إنشاء اختبار مستقل لكل تخصص */
export const ORAL_BUCKET_META = Object.freeze({
  technician: { oralRole: 'technician', trackId: 'maintenance', label: 'فني', accountHint: 'oral_tech' },
  programmer: { oralRole: 'programmer', trackId: 'programming', label: 'برمجة', accountHint: 'oral_prog' },
  network_engineer: { oralRole: 'network_engineer', trackId: 'networks', label: 'شبكات', accountHint: 'oral_net' },
})

function profileFamily(profile) {
  if (!profile) return ''
  if (profile.family) return profile.family
  if (['network_engineer', 'software_engineer', 'systems_analyst', 'systems_engineer', 'technician'].includes(profile.id)) {
    return profile.id === 'technician' ? 'technical' : 'engineering'
  }
  if (profile.id === 'office_admin' || profile.oralRole === 'admin') return 'administrative'
  if (profile.oralRole === 'services') return 'services'
  if (['technical_trades', 'technician'].includes(profile.oralRole)) return 'technical'
  if (['engineering_trades', 'programmer', 'systems_engineer', 'network_engineer'].includes(profile.oralRole)) {
    return 'engineering'
  }
  return ''
}

/** مسمى لا يطابق ملفاً معروفاً — لا يُفرز إلى أي لجنة */
export const UNRESOLVED_STREAM = Object.freeze({
  id: 'unresolved',
  label: 'مسمى غير معروف',
  tracks: [],
})

/** يصنّف المتقدم إلى صف المصفوفة، أو «غير معروف» إن لم يُطابق المسمى ملفاً */
export function resolveEvaluationStream(applicant) {
  const title = effectiveJobTitle(applicant)
  const profile = title ? resolveJobProfile(title) : null
  if (!title || !profile || profile.id === 'unclassified') return UNRESOLVED_STREAM
  const family = profileFamily(profile)

  if (family === 'services') return EVALUATION_STREAMS.services
  if (family === 'administrative' || profile.oralRole === 'admin') return EVALUATION_STREAMS.administrative

  const bucket = resolveOralBucket(applicant)
  if (bucket === 'programmer') return EVALUATION_STREAMS.programming
  if (bucket === 'network_engineer') return EVALUATION_STREAMS.networks
  if (bucket === 'admin') return EVALUATION_STREAMS.administrative
  if (bucket === 'technician' || family === 'technical' || family === 'engineering') return EVALUATION_STREAMS.maintenance
  return UNRESOLVED_STREAM
}

/**
 * مسار الشفهي الوحيد للمتقدم حسب المسمى:
 * فني/صيانة | برمجة ونظم | شبكات — أو null إن لم ينطبق على صف المصفوفة.
 */
export function resolveOralSpecialtyTrack(applicant) {
  const bucket = resolveOralBucket(applicant)
  if (!bucket) return null
  const track = ORAL_BUCKET_META[bucket]?.trackId || null
  if (!track || track === 'writing') return null
  const stream = resolveEvaluationStream(applicant)
  return stream.tracks.includes(track) ? track : null
}

/** مفتاح فرع الشفهي لإنشاء اختبار مستقل وربطه بحساب oral_* */
export function resolveOralBucket(applicantOrProfile) {
  const title = String(
    effectiveJobTitle(applicantOrProfile) ||
      applicantOrProfile?.jobTitle ||
      applicantOrProfile?.label ||
      '',
  ).trim()
  const normalized = normalizeTitle(title)

  // كلمات مفتاحية أقوى من الملف العام (تفادي خلط شبكات/برمجة مع الفني)
  // شبكات أولاً حتى لا يُسحب «مهندس شبكات» إلى البرمجة
  if (normalized && (/شبك/.test(normalized) || /\bnetwork\b/.test(normalized))) return 'network_engineer'
  if (
    normalized &&
    (/برمج|مطور|سوفت|software|programmer|developer|ذكاء اصطناعي|نظم معلومات|محلل نظم|مهندس نظم/.test(normalized))
  ) {
    return 'programmer'
  }
  // المسمى العام «مهندس» → شفهي البرمجة؛ «تقني/فني» يبقى عند الفني
  if (normalized && /^(مساعد\s+)?مهندس(\s+(خبير|استشاري|تقني))?$/.test(normalized)) {
    return 'programmer'
  }

  const profile = applicantOrProfile?.oralRole && !applicantOrProfile?.jobTitle && !applicantOrProfile?.jobTitleCommittee
    ? applicantOrProfile
    : resolveJobProfile(title) || (applicantOrProfile?.oralRole ? applicantOrProfile : null)
  if (!profile) return null

  if (
    profile.id === 'network_technician' ||
    profile.id === 'cybersecurity' ||
    profile.specialty === 'network_operations' ||
    profile.specialty === 'cybersecurity'
  ) {
    return 'network_engineer'
  }
  if (
    profile.id === 'software_engineer' ||
    profile.id === 'advanced_programming' ||
    profile.id === 'artificial_intelligence' ||
    profile.id === 'data_analysis' ||
    profile.id === 'general_engineering' ||
    profile.specialty === 'software' ||
    profile.specialty === 'general_engineering'
  ) {
    return 'programmer'
  }

  const role = canonicalOralRole(profile.oralRole) || profile.oralRole
  if (role === 'programmer' || role === 'systems_engineer') return 'programmer'
  if (role === 'network_engineer') return 'network_engineer'
  if (role === 'admin') return 'admin'
  if (['technician', 'technical_trades', 'services', 'engineering_trades', 'unclassified'].includes(role)) {
    return 'technician'
  }
  return null
}

/** المسارات الفعلية لهذا المتقدم (شفهي واحد فقط من الثلاثة) */
/** فئات الاختبارات المطلوبة لهذا المتقدم، بلا الأمن العسكري. */
export function requiredExamCategories(applicant) {
  const categories = []
  for (const track of tracksForApplicant(applicant)) {
    if (!track?.category || track.category === 'security') continue
    if (!categories.includes(track.category)) categories.push(track.category)
  }
  return categories
}

export function tracksForApplicant(applicant) {
  const stream = resolveEvaluationStream(applicant)
  if (!stream || stream.id === 'unresolved') return []
  const oralSpecialty = resolveOralSpecialtyTrack(applicant)
  return stream.tracks
    .filter((id) => {
      if (!ORAL_SPECIALTY_TRACKS.includes(id)) return true
      return oralSpecialty === id
    })
    .map((id) => trackWithWeight(stream.id, id))
    .filter(Boolean)
}

function trackWithWeight(streamId, id) {
  const track = EVALUATION_TRACKS[id]
  if (!track) return null
  const weight = streamId === 'administrative' ? ADMINISTRATIVE_WEIGHTS[id] : undefined
  if (weight == null || weight === track.weight) return track
  return { ...track, weight }
}

export function applicantAllowsTrack(applicant, trackId) {
  const stream = resolveEvaluationStream(applicant)
  if (!stream || stream.id === 'unresolved' || !stream.tracks.includes(trackId)) return false
  if (ORAL_SPECIALTY_TRACKS.includes(trackId)) {
    return resolveOralSpecialtyTrack(applicant) === trackId
  }
  return true
}

/** يحدد مسار التقييم من حساب المشغّل */
export function resolveOperatorTrack(user) {
  if (!user || user.role !== 'operator') return null
  if (user.category === 'security') return 'security'
  if (user.category === 'personality') return 'personality'
  if (user.category === 'driving') return 'driving'
  if (user.category === 'theory') {
    return user.theoryTrack === 'office' ? 'writing' : 'general'
  }
  if (user.category === 'oral') {
    const role = user.oralRole || ''
    if (['programmer', 'systems_engineer'].includes(role)) return 'programming'
    if (role === 'network_engineer') return 'networks'
    if (role === 'admin') return 'admin_oral'
    if (['technician', 'technical_trades', 'services', 'unclassified'].includes(role)) return 'maintenance'
  }
  return null
}

/**
 * هل يظهر هذا المتقدم لحساب المشغّل وفق المصفوفة؟
 * الاختبار الكتابي (حساب office) لكل من يخضع للشفهي أو أهلية القيادة أو تقييم الشخصية.
 */
export function candidateVisibleToOperator(user, applicant) {
  if (!user || user.role === 'admin' || user.role === 'commander') return true
  if (user.role !== 'operator') return true

  const trackId = resolveOperatorTrack(user)
  if (!trackId) return true
  if (!applicantAllowsTrack(applicant, trackId)) return false

  if (resolveEvaluationStream(applicant).id === 'unresolved') return false

  if (user.category === 'oral' && user.oralRole) {
    const title = effectiveJobTitle(applicant)
    if (!title) return false
    const profile = resolveJobProfile(title)
    if (!profile || profile.id === 'unclassified') return false
    const bucket = resolveOralBucket(applicant)
    const userBucket = resolveOralBucket({ oralRole: user.oralRole })
    if (bucket && userBucket) return bucket === userBucket
    return false
  }

  return true
}

/** سبب رفض الفرز، أو null إن كان المتقدم ضمن مسار الحساب */
export function assignmentSkipReason(user, applicant) {
  if (!user || user.role === 'admin' || user.role === 'commander') return null
  if (candidateVisibleToOperator(user, applicant)) return null
  if (resolveEvaluationStream(applicant).id === 'unresolved') return 'مسمى غير معروف — لا يُفرز حتى يُصحح'
  if (user.category === 'theory' && user.theoryTrack === 'office') return 'المسمى لا يخضع للاختبار الكتابي'
  if (user.category === 'oral' && user.oralRole === 'admin') return 'التصنيف الإداري لا يخضع لاختبار شفهي'
  return 'المسمى خارج مسار هذه اللجنة'
}

export function summarizeTracksForApplicants(applicants) {
  const byStream = new Map()
  for (const applicant of applicants || []) {
    const stream = resolveEvaluationStream(applicant)
    const tracks = tracksForApplicant(applicant).map((t) => t.label)
    if (!byStream.has(stream.id)) {
      byStream.set(stream.id, { streamId: stream.id, label: stream.label, count: 0, trackCounts: new Map() })
    }
    const row = byStream.get(stream.id)
    row.count += 1
    for (const label of tracks) {
      row.trackCounts.set(label, (row.trackCounts.get(label) || 0) + 1)
    }
  }
  return [...byStream.values()].map((row) => ({
    streamId: row.streamId,
    label: row.label,
    count: row.count,
    tracks: [...row.trackCounts.entries()].map(([label, n]) => (n === row.count ? label : `${label} (${n})`)),
  }))
}
