export function normalizePersonName(name: string | null | undefined): string
export function nameParts(name: string | null | undefined): string[]
export function splitTripleName(full: string | null | undefined): { first: string; father: string; family: string }
export function composeTripleName(first: string | null | undefined, father: string | null | undefined, family: string | null | undefined): string
export function assertTripleName(name: string | null | undefined): string
export function isSafePrefixNameMatch(a: string | null | undefined, b: string | null | undefined): boolean
