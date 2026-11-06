import type { User } from '@/services/auth/types'
import type { StaffRole } from '@/types/traceability'

export type { User }

export interface GetAllUsersResponse {
  users: User[]
  total: number
  limit: number
  offset: number
}

export interface GetAllUsersFilters {
  role?: StaffRole
  organizationId?: string
  isAdmin?: boolean
  email?: string
  name?: string
  walletAddress?: string
  walletProvider?: string
  limit?: number
  offset?: number
}
