import { api } from '@/lib/api'
import { toQueryString } from '@/lib/query'
import type { User } from '@/services/auth/types'
import type { Farmer, FarmerImportResult, FarmerStatus, StaffRole } from '@/types/traceability'

export interface FarmersPage {
  total: number
  farmers: Farmer[]
  statusCounts: Partial<Record<FarmerStatus, number>>
}

export const adminService = {
  async assignRole(
    userId: string,
    body: { role: StaffRole; organizationId: string; collectionCenterId?: string | null }
  ): Promise<{ user: User; tx_hash: string }> {
    const response = await api.put<{ data: { user: User; tx_hash: string } }>(
      `/admin/users/${userId}/role`,
      body
    )
    return response.data
  },

  async revokeRole(userId: string): Promise<{ user: User; tx_hash: string }> {
    const response = await api.delete<{ data: { user: User; tx_hash: string } }>(
      `/admin/users/${userId}/role`
    )
    return response.data
  },

  async listFarmers(filters: {
    organizationId?: string
    status?: FarmerStatus
    search?: string
    limit?: number
    offset?: number
  }): Promise<FarmersPage> {
    const query = toQueryString({
      organization_id: filters.organizationId,
      status: filters.status,
      search: filters.search,
      limit: filters.limit,
      offset: filters.offset,
    })
    const response = await api.get<{ data: FarmersPage }>(`/admin/farmers${query}`)
    return response.data
  },

  /**
   * Imports the farmer list. If the CSV has errors the backend responds 422
   * with per-line details: they are returned as a result, not thrown.
   */
  async importFarmers(csv: string, dryRun: boolean): Promise<FarmerImportResult> {
    try {
      const response = await api.post<{ data: FarmerImportResult }>('/admin/farmers/import', { csv, dryRun })
      return response.data
    } catch (error) {
      const data = (error as { data?: FarmerImportResult }).data
      if (data) return data
      throw error
    }
  },
}
