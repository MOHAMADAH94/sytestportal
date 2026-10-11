/** حسابات الوصول العاملة، مشتقة من جدول اللجان */
import { COMMITTEE_ACCOUNTS } from '../shared/committeeCatalog.js'

export const ACCESS_ACCOUNTS = COMMITTEE_ACCOUNTS.map((account) => ({
  username: account.username,
  label: account.label,
  category: account.category,
  oralRole: account.oralRole,
  theoryTrack: account.theoryTrack,
  description: account.description,
}))
