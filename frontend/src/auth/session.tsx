import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import type { User } from '../lib/types'

type AuthStatus = 'authenticated' | 'unauthenticated' | 'unavailable' | 'loading'
interface Snapshot { status: AuthStatus; user: User | null; token: string | null }
interface Session extends Snapshot {
  accept: (user: User) => void
  logout: () => void
  retry: () => void
}

declare global {
  interface Window {
    __conduit_debug__?: {
      getToken: () => string | null
      getAuthState: () => AuthStatus
      getCurrentUser: () => User | null
    }
  }
}

const tokenKey = 'jwtToken'
const guest: Snapshot = { status: 'unauthenticated', user: null, token: null }
const SessionContext = createContext<Session | undefined>(undefined)

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const request = useRef<AbortController | null>(null)
  const [session, setSession] = useState<Snapshot>(() => {
    const token = localStorage.getItem(tokenKey)
    return token ? { status: 'loading', token, user: null } : guest
  })

  const current = useRef(session)
  const publish = useCallback((next: Snapshot) => {
    current.current = next
    setSession(next)
  }, [])

  const logout = useCallback(() => {
    request.current?.abort()
    localStorage.removeItem(tokenKey)
    client.clear()
    publish(guest)
  }, [client, publish])

  const accept = useCallback((user: User) => {
    request.current?.abort()
    localStorage.setItem(tokenKey, user.token)
    client.clear()
    publish({ status: 'authenticated', token: user.token, user })
  }, [client, publish])

  const restore = useCallback(async () => {
    request.current?.abort()
    const token = localStorage.getItem(tokenKey)
    if (token !== current.current.token) client.clear()
    if (!token) { publish(guest); return }
    const controller = new AbortController()
    request.current = controller
    publish({ status: 'loading', user: null, token })
    try {
      const result = await api<{ user: User }>('/user', { token, signal: controller.signal })
      if (controller.signal.aborted) return
      if (!result?.user?.username || !result.user.token) throw new Error('Invalid user response')
      publish({ status: 'authenticated', user: { ...result.user, token }, token })
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) logout()
      else publish({ status: 'unavailable', user: null, token })
    }
  }, [client, logout, publish])

  useEffect(() => {
    void restore()
    const sync = (event: StorageEvent) => {
      if (event.key === tokenKey || event.key === null) void restore()
    }
    window.addEventListener('storage', sync)
    return () => { request.current?.abort(); window.removeEventListener('storage', sync) }
  }, [restore])

  useEffect(() => {
    window.__conduit_debug__ = {
      getToken: () => current.current.token,
      getAuthState: () => current.current.status,
      getCurrentUser: () => current.current.user,
    }
    return () => { delete window.__conduit_debug__ }
  }, [])

  return <SessionContext.Provider value={{ ...session, accept, logout, retry: restore }}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('SessionProvider is required')
  return session
}
