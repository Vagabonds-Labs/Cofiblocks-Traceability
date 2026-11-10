/** Pilot staff roles. They match the backend's `StaffRole`. */
export const STAFF_ROLES = [
  'COLLECTOR',
  'COMMITTEE_MEMBER',
  'INDUSTRY_MANAGER',
  'STORE_KEEPER',
  'EXPORT_MANAGER',
] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

export type OrganizationKind = 'COOPERATIVE' | 'UNION'

export type FarmerStatus = 'PRELOADED' | 'LINKED' | 'REGISTERED' | 'CONSENTED'

export interface CollectionCenter {
  id: string
  name: string
  chainId: number
}

export interface Organization {
  id: string
  kind: OrganizationKind
  name: string
  code: string
  chainId: number
  region: string | null
  zone: string | null
  woreda: string | null
  collectionCenters: CollectionCenter[]
  _count: { farmers: number; users: number }
}

export interface Farmer {
  id: string
  coopFarmerId: string
  fullName: string | null
  phone: string | null
  status: FarmerStatus
  telegramUsername: string | null
  linkedAt: string | null
  organization: { id: string; code: string; name: string }
  collectionCenter: { id: string; name: string } | null
}

export interface FarmerImportResult {
  dryRun: boolean
  created: number
  updated: number
  unchanged: number
  errors: { line: number; message: string }[]
}
