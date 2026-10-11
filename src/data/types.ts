export type ExamLevel = 'technician' | 'engineer'

export type ExamCategory =
  | 'theory'
  | 'oral'
  | 'driving'
  | 'personality'
  | 'security'

export type OralRole =
  | 'technician'
  | 'programmer'
  | 'network_engineer'
  | 'systems_engineer'
  | 'admin'
  | 'services'
  | 'technical_trades'
  | 'engineering_trades'
  | 'unclassified'

export type QuestionType =
  | 'mcq'
  | 'true_false'
  | 'open'
  | 'oral'
  | 'scale'
  | 'classic'

export interface Choice {
  id: string
  text: string
}

export interface Question {
  id: string
  category: ExamCategory
  role?: OralRole
  type: QuestionType
  topic: string
  text: string
  choices?: Choice[]
  correctAnswer?: string | string[]
  explanation?: string
  answerKey?: string
  difficulty: 'easy' | 'medium' | 'hard' | 'advanced'
  isShared?: boolean
  jobTitles?: string[]
  specialties?: string[]
  jobLevels?: string[]
  skill?: string
  rubric?: { criterion: string; maxPoints: number }[]
  points: number
  trait?: string
  /** لعبارات الشخصية ذات الصياغة العكسية */
  reverse?: boolean
  level?: ExamLevel | 'both'
}

export interface ExamConfig {
  id: string
  title: string
  category: ExamCategory
  role?: OralRole
  level?: ExamLevel
  capacity?: number
  questionCount: number
  topics?: string[]
  difficulty?: 'easy' | 'medium' | 'hard' | 'advanced' | 'mixed'
  questionIds?: string[]
  createdAt?: string
}

export const EXAM_LEVELS: { id: ExamLevel; label: string; description: string }[] = [
  { id: 'technician', label: 'مستوى فني', description: 'أسئلة للمستوى الفني' },
  { id: 'engineer', label: 'مستوى مهندس', description: 'أسئلة للمستوى الهندسي' },
]

export const ORAL_ROLES: { id: OralRole; label: string; description: string }[] = [
  { id:'services', label:'التخصصات الخدمية', description:'الحراسة والخدمات ومتابعة الآليات وصيانة المرافق' },
  { id:'technical_trades', label:'التخصصات الفنية والتقنية', description:'الكهرباء والميكانيك والإلكترونيات' },
  { id:'engineering_trades', label:'التخصصات الهندسية', description:'الهندسة المدنية والكهربائية والميكانيكية والاتصالات' },
  { id:'unclassified', label:'تخصص جديد', description:'يستكمل المسؤول أسئلته حسب مهام المسمى' },
  { id: 'technician', label: 'فني', description: 'أسئلة شفهية للفنيين والصيانة' },
  { id: 'programmer', label: 'مبرمج ونظم', description: 'أسئلة شفهية للمبرمجين ومهندسي النظم (مسار موحّد)' },
  { id: 'network_engineer', label: 'مهندس شبكات', description: 'أسئلة شفهية لمهندسي الشبكات' },
  { id: 'systems_engineer', label: 'مبرمج ونظم', description: 'مسار موحّد مع المبرمج — يظهر للاختبارات القديمة' },
  { id: 'admin', label: 'إداري', description: 'تصنيف بلا اختبار شفهي؛ يخضع للكتابي وأهلية القيادة والشخصية' },
]

/** مواضيع الاختبار الكتابي ضمن بنك أسئلة العام */
export const OFFICE_ADMIN_TOPICS = [
  'Excel',
  'Word',
  'PowerPoint',
  'Outlook والبريد',
  'Windows مكتبي',
  'أعمال إدارية مكتبية',
] as const

export type TheoryTrack = 'general' | 'office'

export const THEORY_TRACKS: {
  id: TheoryTrack
  label: string
  description: string
}[] = [
  {
    id: 'general',
    label: 'عام',
    description: 'اختبار العام للمسار الخدمي (وزن 100%)',
  },
  {
    id: 'office',
    label: 'اختبار كتابي',
    description: 'كتابي لتصنيفات اداري وبرمجيات وشبكات وفني',
  },
]

export const CATEGORY_META: Record<
  ExamCategory,
  { label: string; description: string; color: string }
> = {
  theory: {
    label: 'اختبارات عام',
    description: 'توليد من بنك الأسئلة مع سلم الحل وملف PDF',
    color: 'from-gold to-gold-2',
  },
  oral: {
    label: 'اختبارات شفهية',
    description: 'حسب التصنيف: فني، برمجيات، شبكات',
    color: 'from-accent-gold to-gold-2',
  },
  driving: {
    label: 'أهلية قيادة الضابط',
    description: 'تقييم أهلية القيادة (Leadership) للضابط: انضباط، قرار، قدوة، إدارة أفراد — بلا علاقة بالمركبات',
    color: 'from-light-gold-2 to-gold',
  },
  personality: {
    label: 'اختبارات شخصية',
    description: 'قياس السمات والميول السلوكية',
    color: 'from-light-gold to-accent-gold',
  },
  security: {
    label: 'الأمن العسكري',
    description: 'قبول أو رفض المتقدم مع ملاحظة أمنية — بلا أسئلة',
    color: 'from-gold to-light-gold',
  },
}

export interface PersonalityTrait {
  name: string
  score: number
  max: number
  percent: number
}

export interface PersonalityResult {
  traits: PersonalityTrait[]
  summary: string
}

export interface ExamAttempt {
  id: string
  examId: string
  examineeName: string
  applicantId?: string | null
  rosterId?: string | null
  answers: Record<string, string | number | string[]>
  score: number
  maxScore: number
  percent: number | null
  correctCount?: number | null
  objectiveCount?: number | null
  personality?: PersonalityResult | null
  startedAt: string
  finishedAt: string
  evaluationStatus?: 'pending' | 'completed'
  evaluations?: any[]
  clientIp?: string
}
