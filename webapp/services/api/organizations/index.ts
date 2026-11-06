import { api } from '@/lib/api'
import type { Organization } from '@/types/traceability'

export const organizationsService = {
  async list(): Promise<Organization[]> {
    const response = await api.get<{ data: { organizations: Organization[] } }>('/organizations')
    return response.data.organizations
  },
}
