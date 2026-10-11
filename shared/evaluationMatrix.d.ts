export interface EvaluationTrack {
  id: string
  label: string
  weight: number | null
  category: string
  theoryTrack?: string
  oralRoles?: string[]
}

export interface EvaluationStream {
  id: string
  label: string
  tracks: string[]
}

export interface OralBucketMeta {
  oralRole: string
  trackId: string
  label: string
  accountHint: string
}

export const EVALUATION_TRACKS: Readonly<Record<string, EvaluationTrack>>
export const EVALUATION_STREAMS: Readonly<Record<string, EvaluationStream>>
export const ORAL_SPECIALTY_TRACKS: ReadonlyArray<string>
export const ORAL_BUCKET_META: Readonly<Record<string, OralBucketMeta>>

export type ApplicantLike = {
  jobTitle?: string
  jobTitleOrg?: string
  jobTitleCommittee?: string
  extra?: Record<string, string>
  interviewType?: string
}

export function resolveEvaluationStream(applicant: ApplicantLike): EvaluationStream
export function resolveOralSpecialtyTrack(applicant: ApplicantLike): string | null
export function resolveOralBucket(applicantOrProfile: ApplicantLike | { oralRole?: string | null }): string | null
export function tracksForApplicant(applicant: ApplicantLike): EvaluationTrack[]
export function applicantAllowsTrack(applicant: ApplicantLike, trackId: string): boolean
export function resolveOperatorTrack(user: {
  role?: string
  category?: string
  oralRole?: string | null
  theoryTrack?: string | null
} | null | undefined): string | null

export function candidateVisibleToOperator(
  user: {
    role?: string
    category?: string
    oralRole?: string | null
    theoryTrack?: string | null
  } | null | undefined,
  applicant: ApplicantLike,
): boolean

export function summarizeTracksForApplicants(applicants: ApplicantLike[]): Array<{
  streamId: string
  label: string
  count: number
  tracks: string[]
}>
