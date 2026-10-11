export type ExamineeSheetRow = {
  displayId?: string
  examineeName?: string
  org?: string
  jobTitle?: string
  rank?: string
  jobTitleOrg?: string
  jobTitleCommittee?: string
  proposedSalary?: number | null
  rankCommittee?: string
  approvedSalary?: number | null
  educationCommittee?: string
  extra?: Record<string, string>
  finalPercent?: number | null
  examResults?: Array<{
    title?: string
    trackId?: string | null
    trackLabel?: string | null
    weight?: number | null
    score?: number | null
  }>
}

export function buildExamineeScoreSheet(rows: ExamineeSheetRow[]): { header: string[]; data: unknown[][] }
