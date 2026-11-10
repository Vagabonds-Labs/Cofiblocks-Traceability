'use client'

import { ApiError } from '@/lib/api'
import { useCallback, useEffect, useState } from 'react'
import { authService } from './authService'
import type { User } from './types'

export function useUserData() {
  // Starts empty and is filled on mount: reading `localStorage` during render
  // made the server (no user) and the client (with user) render differently,
  // and React threw away the whole tree.
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const stored = authService.getCurrentUser()
    if (stored) setUser(stored)
  }, [])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUser = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // If not authenticated, try restoring from refresh cookie
      if (!authService.isAuthenticated()) {
        const restored = await authService.restoreSessionFromRefreshToken()
        if (!restored) {
          setUser(null)
          setLoading(false)
          return
        }
      }

      // If we have a token, load user from API
      const fetched = await authService.getCurrentUserFromApi()
      setUser(fetched)

    } catch (err) {
      const apiError = err as ApiError

      // Token expired or invalid → full logout
      if (apiError.statusCode === 401) {
        await authService.logout()
      }

      setUser(null)
      setError(apiError.message || 'Failed to load user')

    } finally {
      setLoading(false)
    }
  }, [])

  // Without a session there is nothing to load: besides clearing the user, the
  // loading state has to end, or the page waits forever.
  const clearUser = useCallback(() => {
    setUser(null)
    setLoading(false)
  }, [])

  return { user, loading, error, loadUser, setUser, clearUser }
}
