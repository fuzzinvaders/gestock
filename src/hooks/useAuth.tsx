import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, messageOf } from '../lib/api'
import type { SafeUser } from '../lib/types'

interface SessionResponse {
  user: SafeUser | null
  needsSetup: boolean
}

interface AuthContextValue {
  user: SafeUser | null
  loading: boolean
  needsSetup: boolean
  login: (username: string, password: string) => Promise<string | null>
  setup: (username: string, password: string) => Promise<string | null>
  register: (username: string, password: string, code: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<SessionResponse>('/api/session')
      .then((res) => {
        setUser(res.user)
        setNeedsSetup(res.needsSetup)
      })
      .finally(() => setLoading(false))
  }, [])

  async function login(username: string, password: string) {
    try {
      const res = await api.post<{ user: SafeUser }>('/api/login', { username, password })
      setUser(res.user)
      return null
    } catch (err) {
      return messageOf(err, 'Erreur de connexion')
    }
  }

  async function setup(username: string, password: string) {
    try {
      const res = await api.post<{ user: SafeUser }>('/api/setup', { username, password })
      setUser(res.user)
      setNeedsSetup(false)
      return null
    } catch (err) {
      return messageOf(err, 'Erreur de création du compte')
    }
  }

  async function register(username: string, password: string, code: string) {
    try {
      const res = await api.post<{ user: SafeUser }>('/api/register', { username, password, code })
      setUser(res.user)
      return null
    } catch (err) {
      return messageOf(err, 'Erreur de création du compte')
    }
  }

  async function signOut() {
    await api.post('/api/logout')
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, needsSetup, login, setup, register, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
