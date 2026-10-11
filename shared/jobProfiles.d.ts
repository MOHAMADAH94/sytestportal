export interface JobProfile { id: string; label: string; specialty: string; specialtyLabel: string; oralRole: string; level: string; aliases: string[]; family?: string }
export interface ApplicantTitleSource {
  id?: string
  jobTitle?: string
  jobTitleOrg?: string
  jobTitleCommittee?: string
}
export interface ApplicantGroup {
  key: string
  jobTitle: string
  missingTitle: boolean
  appearsForAll: boolean
  profileId: string
  applicantIds: string[]
}
export const JOB_PROFILES: JobProfile[]
export const JOB_LEVELS: { id: string; label: string }[]
export const DIFFICULTIES: { id: string; label: string }[]
export function normalizeTitle(value: unknown): string
export function resolveJobProfile(title: string): JobProfile | null
export function inferJobLevel(title: string): string
export function effectiveJobTitle(applicant: ApplicantTitleSource | null | undefined): string
export function hasJobTitle(applicant: ApplicantTitleSource | null | undefined): boolean
export function groupApplicants(applicants: ApplicantTitleSource[]): ApplicantGroup[]
export const MERGED_ORAL_ROLES: readonly string[]
export function canonicalOralRole(role: string | null | undefined): string | null
export function compatibleOralRoles(role: string | null | undefined): string[]
export function oralRolesCompatible(a: string | null | undefined, b: string | null | undefined): boolean
export function canUseProfile(user: { role: string; category?: string; oralRole?: string | null; theoryTrack?: string | null } | null, profile: JobProfile, category: string): boolean
