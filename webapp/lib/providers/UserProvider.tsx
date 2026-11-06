'use client'

import { createContext, useContext } from 'react'
import { useUserData, useAuthWatcher, useWalletWatcher } from '@/services/auth'
import type { User } from '@/services/auth/types'

interface UserContextType {
  user: User | null
  loading: boolean
  error: string | null
  refreshUser: () => Promise<void>
}

const UserContext = createContext<UserContextType | null>(null)

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within a UserProvider')
  return ctx
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, error, loadUser, clearUser } = useUserData();

  useAuthWatcher(loadUser, clearUser);
  useWalletWatcher(user, clearUser);

  return (
    <UserContext.Provider value={{ user, loading, error, refreshUser: loadUser }}>
      {children}
    </UserContext.Provider>
  );
}

