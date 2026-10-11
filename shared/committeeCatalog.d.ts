export interface ClassificationRule {
  id: string
  label: string
  examTrackIds: readonly string[]
  weights: Readonly<Record<string, number>> | null
}

export interface CommitteeAccount {
  username: string
  label: string
  category: string
  oralRole: string | null
  theoryTrack: 'general' | 'office' | null
  description: string
  tests: string
  classifications: readonly string[]
  toCommittee: boolean
}

export interface CommitteeLane {
  id: string
  label: string
  username: string
  category: string
  oralRole: string | null
  theoryTrack: 'general' | 'office' | null
  description: string
  tests: string
  classifications: readonly string[]
  toCommittee: boolean
  ownerUsername: string
  hint: string
}

export const RETIRED_ACCESS_USERNAMES: readonly string[]
export const CLASSIFICATION_RULES: Readonly<Record<string, ClassificationRule>>
export const COMMITTEE_ACCOUNTS: readonly CommitteeAccount[]
export const COMMITTEE_LANES: readonly CommitteeLane[]
