import { ADDITIONAL_JOB_PROFILES } from './additionalJobProfiles.js'
export const JOB_PROFILES = [
  { id: 'network_engineer', label: 'مهندس شبكات', specialty: 'networks', specialtyLabel: 'الشبكات والبنية التحتية', oralRole: 'network_engineer', level: 'engineer', aliases: ['مهندس شبكات', 'مهندس الشبكات', 'شبكات', 'شبكه', 'network engineer'] },
  { id: 'software_engineer', label: 'مهندس برمجيات', specialty: 'software', specialtyLabel: 'البرمجيات والتطوير', oralRole: 'programmer', level: 'engineer', aliases: ['مبرمج', 'برمجة', 'برمجه', 'مهندس برمجيات', 'مهندس برمجيات رئيسي', 'مهندس برامج', 'مطور برمجيات', 'مهندس حاسوب', 'مهندس برمجيات ونظم', 'مهندس برمجيات ونظم معلومات', 'مهندس نظم وبرمجيات', 'مهندس معلوماتية', 'مهندس اتصالات وبرمجيات', 'software engineer', 'programmer', 'developer'] },
  { id: 'systems_analyst', label: 'محلل نظم', specialty: 'analysis', specialtyLabel: 'تحليل المتطلبات وتصميم الأنظمة', oralRole: 'systems_engineer', level: 'engineer', aliases: ['محلل نظم', 'محلل النظم', 'محلل أنظمة', 'محلل نظم معلومات', 'systems analyst', 'system analyst'] },
  { id: 'systems_engineer', label: 'مهندس نظم', specialty: 'systems', specialtyLabel: 'الخوادم والأنظمة والخدمات', oralRole: 'systems_engineer', level: 'engineer', aliases: ['مهندس نظم', 'مهندس أنظمة', 'مهندس نظم معلومات', 'مهندس النظم', 'systems engineer', 'system administrator'] },
  { id: 'technician', label: 'فني حاسب آلي', specialty: 'support', specialtyLabel: 'الدعم الفني والصيانة', oralRole: 'technician', level: 'technician', aliases: ['فني', 'فني حاسب', 'فني حاسب آلي', 'فني حاسوب', 'فني دعم', 'فني دعم فني', 'صيانة', 'صيانه', 'technician', 'it support'] },
  { id: 'office_admin', label: 'إداري', specialty: 'administration', specialtyLabel: 'الإدارة والأعمال المكتبية', oralRole: 'admin', level: 'technician', aliases: ['إداري', 'اداري', 'اداري الفرع', 'إداري فرع', 'اداري بالفرع', 'إداري بالفرع', 'موظف إداري', 'إداري مكتب', 'office administrator'] },
  ...ADDITIONAL_JOB_PROFILES,
  { id:'unclassified', label:'تخصص جديد — أسئلة يدوية أو مشتركة فقط', specialty:'unclassified', specialtyLabel:'يحدد المسؤول أسئلة هذا المسمى الجديد', oralRole:'unclassified', level:'technician', aliases:[] },
]
export const JOB_LEVELS = [{ id: 'junior', label: 'مبتدئ' }, { id: 'intermediate', label: 'ممارس' }, { id: 'senior', label: 'أقدم' }, { id: 'expert', label: 'خبير' }]
export const DIFFICULTIES = [{ id: 'easy', label: 'سهل' }, { id: 'medium', label: 'متوسط' }, { id: 'hard', label: 'صعب' }, { id: 'advanced', label: 'متقدم' }]
export const normalizeTitle = (value) => String(value || '').trim().toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/[\u064B-\u065F\u0640]/g, '').replace(/\s+/g, ' ')
export function resolveJobProfile(title) {
  const value = normalizeTitle(title)
  return JOB_PROFILES.find((profile) => profile.aliases.some((alias) => normalizeTitle(alias) === value)) || null
}
export function inferJobLevel(title) {
  const value = normalizeTitle(title)
  if (/(خبير|استشاري)/.test(value)) return 'expert'
  if (/(اقدم|رئيسي|رئيس|مشرف)/.test(value)) return 'senior'
  if (/(مبتدئ|متدرب|مساعد)/.test(value)) return 'junior'
  return 'intermediate'
}
/** المسمى المعتمد للتقييم: قرار اللجنة ثم المسمى المسجّل ثم الوارد من الجهة. */
export function effectiveJobTitle(applicant) {
  return String(
    applicant?.jobTitleCommittee ||
    applicant?.jobTitle ||
    applicant?.jobTitleOrg ||
    '',
  ).trim()
}

export function hasJobTitle(applicant) {
  return Boolean(effectiveJobTitle(applicant))
}

export function groupApplicants(applicants) {
  const groups = new Map()
  for (const applicant of applicants) {
    const title = effectiveJobTitle(applicant)
    const key = normalizeTitle(title) || '__missing__'
    const missingTitle = !title
    const profileId = resolveJobProfile(title)?.id || (missingTitle ? 'unclassified' : '')
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        jobTitle: title,
        missingTitle,
        /** بلا مسمى: يظهر مع الجميع ويمكن تصنيفه لاحقاً */
        appearsForAll: missingTitle,
        profileId,
        applicantIds: [],
      })
    }
    groups.get(key).applicantIds.push(applicant.id)
  }
  return [...groups.values()]
}
/** شفهي المبرمج ومهندس النظم مسار واحد؛ تبقى القيم القديمة في الاختبارات والأرشيف متوافقة. */
export const MERGED_ORAL_ROLES = Object.freeze(['programmer', 'systems_engineer'])

export function canonicalOralRole(role) {
  return role === 'systems_engineer' ? 'programmer' : role || null
}

export function compatibleOralRoles(role) {
  if (!role) return []
  return MERGED_ORAL_ROLES.includes(role) ? [...MERGED_ORAL_ROLES] : [role]
}

export function oralRolesCompatible(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  return MERGED_ORAL_ROLES.includes(a) && MERGED_ORAL_ROLES.includes(b)
}

/** نفس تجميع الفرز: فني مع المهن الفنية، وبرمجة مع النظم */
export function oralBucketKey(role) {
  const canonical = canonicalOralRole(role)
  if (!canonical) return null
  if (canonical === 'programmer' || canonical === 'systems_engineer') return 'programmer'
  if (canonical === 'network_engineer') return 'network_engineer'
  if (canonical === 'admin') return 'admin'
  if (['technician', 'technical_trades', 'services', 'engineering_trades'].includes(canonical)) return 'technician'
  return canonical
}

export function canUseProfile(user, profile, category) {
  if (user?.role === 'admin' || user?.role === 'commander') return true
  if (user?.role !== 'operator' || user.category !== category) return false
  if (category === 'oral' && user.oralRole && oralBucketKey(user.oralRole) !== oralBucketKey(profile.oralRole)) return false
  if (profile.id === 'unclassified') return ['driving', 'personality'].includes(category)
  const written = isWrittenExamProfile(profile)
  if (category === 'theory' && user.theoryTrack === 'office' && !written) return false
  if (category === 'theory' && user.theoryTrack === 'general' && written) return false
  return true
}

/** الاختبار الكتابي للإداري وبرمجيات وشبكات والفني، لا للتصنيف الخدمي. */
function isWrittenExamProfile(profile) {
  if (!profile || profile.id === 'unclassified') return false
  if (profile.family === 'services' || profile.oralRole === 'services') return false
  if (profile.id === 'office_admin' || profile.family === 'administrative' || profile.oralRole === 'admin') return true
  if (profile.family === 'technical' || profile.family === 'engineering') return true
  if (['network_engineer', 'software_engineer', 'systems_analyst', 'systems_engineer', 'technician'].includes(profile.id)) return true
  if (['technician', 'technical_trades', 'engineering_trades', 'programmer', 'systems_engineer', 'network_engineer'].includes(profile.oralRole)) return true
  return false
}
