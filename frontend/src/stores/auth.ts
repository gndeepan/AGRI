import { create } from 'zustand'
import type { UserOut } from '@/api/types'

interface AuthState {
  user: UserOut | null
  status: 'unknown' | 'authenticated' | 'anonymous'
  setUser: (u: UserOut | null) => void
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'unknown',
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'anonymous' }),
}))
