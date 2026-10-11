/**
 * مصدر واحد للجان والتصنيفات.
 * أي فرز أو حساب وصول يُشتق من هنا حتى لا يختلف الجدول عن التنفيذ.
 *
 * الاختبارات حسب التصنيف:
 * - خدمي: عام فقط.
 * - اداري: كتابي، أهلية، شخصية.
 * - برمجيات: كتابي، شخصية، أهلية، وبرمجة.
 * - شبكات: كتابي، شخصية، أهلية، وشبكات.
 * - فني: كتابي، شخصية، أهلية، وفني.
 *
 * الأمن العسكري مراجعة لكل التصنيفات، وليس اختباراً ضمن الجدول أعلاه.
 * oral_sys مكرر لمسار البرمجة، وoral_adm بلا اختبار بعد إلغاء الشفهي الإداري.
 */

/** حسابات حُذفت لأنها لا تفرز أحداً */
export const RETIRED_ACCESS_USERNAMES = Object.freeze(['oral_sys', 'oral_adm'])

export const CLASSIFICATION_RULES = Object.freeze({
  services: Object.freeze({
    id: 'services',
    label: 'خدمي',
    examTrackIds: Object.freeze(['general']),
    weights: null,
  }),
  administrative: Object.freeze({
    id: 'administrative',
    label: 'اداري',
    examTrackIds: Object.freeze(['writing', 'driving', 'personality']),
    weights: Object.freeze({ writing: 30, driving: 35, personality: 35 }),
  }),
  programming: Object.freeze({
    id: 'programming',
    label: 'برمجيات',
    examTrackIds: Object.freeze(['writing', 'personality', 'driving', 'programming']),
    weights: null,
  }),
  networks: Object.freeze({
    id: 'networks',
    label: 'شبكات',
    examTrackIds: Object.freeze(['writing', 'personality', 'driving', 'networks']),
    weights: null,
  }),
  maintenance: Object.freeze({
    id: 'maintenance',
    label: 'فني',
    examTrackIds: Object.freeze(['writing', 'personality', 'driving', 'maintenance']),
    weights: null,
  }),
})

export const COMMITTEE_ACCOUNTS = Object.freeze([
  Object.freeze({
    username: 'theory',
    label: 'حساب العام',
    category: 'theory',
    oralRole: null,
    theoryTrack: 'general',
    description: 'اختبار العام للتصنيف الخدمي — اللجنة الأولى',
    tests: 'عام',
    classifications: Object.freeze(['خدمي']),
    toCommittee: true,
  }),
  Object.freeze({
    username: 'theory2',
    label: 'حساب العام 2',
    category: 'theory',
    oralRole: null,
    theoryTrack: 'general',
    description: 'اختبار العام للتصنيف الخدمي — اللجنة الثانية',
    tests: 'عام',
    classifications: Object.freeze(['خدمي']),
    toCommittee: true,
  }),
  Object.freeze({
    username: 'office',
    label: 'اختبار كتابي',
    category: 'theory',
    oralRole: null,
    theoryTrack: 'office',
    description: 'اختبار كتابي لتصنيفات اداري وبرمجيات وشبكات وفني',
    tests: 'كتابي',
    classifications: Object.freeze(['اداري', 'برمجيات', 'شبكات', 'فني']),
    toCommittee: true,
  }),
  Object.freeze({
    username: 'oral_prog',
    label: 'اختبار البرمجة',
    category: 'oral',
    oralRole: 'programmer',
    theoryTrack: null,
    description: 'اختبار البرمجة لتصنيف البرمجيات',
    tests: 'برمجة',
    classifications: Object.freeze(['برمجيات']),
    toCommittee: true,
  }),
  Object.freeze({
    username: 'oral_net',
    label: 'اختبار الشبكات',
    category: 'oral',
    oralRole: 'network_engineer',
    theoryTrack: null,
    description: 'اختبار الشبكات لتصنيف الشبكات',
    tests: 'شبكات',
    classifications: Object.freeze(['شبكات']),
    toCommittee: true,
  }),
  Object.freeze({
    username: 'oral_tech',
    label: 'اختبار الفني',
    category: 'oral',
    oralRole: 'technician',
    theoryTrack: null,
    description: 'اختبار الفني لتصنيف الفني',
    tests: 'فني',
    classifications: Object.freeze(['فني']),
    toCommittee: true,
  }),
  Object.freeze({
    username: 'driving',
    label: 'أهلية قيادة الضابط',
    category: 'driving',
    oralRole: null,
    theoryTrack: null,
    description: 'أهلية القيادة لتصنيفات اداري وبرمجيات وشبكات وفني',
    tests: 'أهلية',
    classifications: Object.freeze(['اداري', 'برمجيات', 'شبكات', 'فني']),
    toCommittee: true,
  }),
  Object.freeze({
    username: 'personality',
    label: 'تقييم الشخصية',
    category: 'personality',
    oralRole: null,
    theoryTrack: null,
    description: 'تقييم الشخصية لتصنيفات اداري وبرمجيات وشبكات وفني',
    tests: 'شخصية',
    classifications: Object.freeze(['اداري', 'برمجيات', 'شبكات', 'فني']),
    toCommittee: true,
  }),
  Object.freeze({
    username: 'military_security',
    label: 'الأمن العسكري',
    category: 'security',
    oralRole: null,
    theoryTrack: null,
    description: 'مراجعة أمنية لكل التصنيفات، وليست اختباراً موزوناً',
    tests: 'مراجعة أمنية',
    classifications: Object.freeze(['خدمي', 'اداري', 'برمجيات', 'شبكات', 'فني']),
    toCommittee: false,
  }),
])

export const COMMITTEE_LANES = Object.freeze(
  COMMITTEE_ACCOUNTS.map((account) =>
    Object.freeze({
      id: account.username,
      label: account.label,
      username: account.username,
      category: account.category,
      oralRole: account.oralRole,
      theoryTrack: account.theoryTrack,
      description: account.description,
      tests: account.tests,
      classifications: account.classifications,
      toCommittee: account.toCommittee,
      ownerUsername: account.username,
      hint: account.tests,
    }),
  ),
)
