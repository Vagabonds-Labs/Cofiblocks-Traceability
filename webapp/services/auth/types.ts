import type { OrganizationKind, StaffRole } from '@/types/traceability'

export interface User {
  id: string
  name: string | null
  email: string | null
  telegramUsername?: string | null
  walletAddress?: string | null
  walletProvider?: string | null
  isAdmin?: boolean
  role?: StaffRole | null
  organizationId?: string | null
  collectionCenterId?: string | null
  roleTx?: string | null
  organization?: { id: string; name: string; code: string; kind: OrganizationKind } | null
  collectionCenter?: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}
