import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { SessionProvider, useSession } from './session'

const user = { username: 'reader', email: 'reader@test.invalid', bio: null, image: null, token: 'fresh' }

function SessionView() {
  const session = useSession()
  return <>
    <output>{session.status} {session.user?.username}</output>
    <button onClick={session.retry}>Retry</button>
    <button onClick={session.logout}>Logout</button>
    <button onClick={() => session.accept(user)}>Sign in</button>
  </>
}

function show() {
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><SessionProvider><SessionView /></SessionProvider></QueryClientProvider>)
  return client
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

it('revalidates a stored token and clears cached private data on logout', async () => {
  localStorage.setItem('jwtToken', 'fresh')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ user })))
  const client = show()
  await screen.findByText('authenticated reader')
  client.setQueryData(['account'], { email: user.email })
  expect(window.__conduit_debug__?.getCurrentUser()).toEqual(user)
  fireEvent.click(screen.getByText('Logout'))
  expect(screen.getByText('unauthenticated')).toBeVisible()
  expect(localStorage.getItem('jwtToken')).toBeNull()
  expect(client.getQueryData(['account'])).toBeUndefined()
})

it('retains the token on outages and can reconnect', async () => {
  localStorage.setItem('jwtToken', 'fresh')
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ user })))
  show()
  await screen.findByText('unavailable')
  expect(localStorage.getItem('jwtToken')).toBe('fresh')
  fireEvent.click(screen.getByText('Retry'))
  await screen.findByText('authenticated reader')
})

it('discards an invalid credential on startup', async () => {
  localStorage.setItem('jwtToken', 'old')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
  show()
  await screen.findByText('unauthenticated')
  expect(window.__conduit_debug__?.getToken()).toBeNull()
})

it('keeps the new session if an older validation request finishes late', async () => {
  localStorage.setItem('jwtToken', 'old')
  let complete!: (value: Response) => void
  const pending = new Promise<Response>(resolve => { complete = resolve })
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending))
  show()
  fireEvent.click(screen.getByText('Sign in'))
  complete(new Response('', { status: 401 }))
  await waitFor(() => expect(window.__conduit_debug__?.getAuthState()).toBe('authenticated'))
  expect(localStorage.getItem('jwtToken')).toBe('fresh')
})

it('keeps the credential presented on a restored session when the server issues a newer JWT', async () => {
  localStorage.setItem('jwtToken', 'presented')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ user })))
  const client = show()
  client.setQueryData(['already-loading'], 1)
  await screen.findByText('authenticated reader')
  expect(localStorage.getItem('jwtToken')).toBe('presented')
  expect(window.__conduit_debug__?.getToken()).toBe('presented')
  expect(client.getQueryData(['already-loading'])).toBe(1)
})

it('exposes the accepted settings response immediately in the same event turn', () => {
  let observed: string | null | undefined
  function AcceptResponse() {
    const session = useSession()
    return <button onClick={() => {
      session.accept({ ...user, bio: 'Second update' })
      observed = window.__conduit_debug__?.getCurrentUser()?.bio
    }}>Accept confirmed update</button>
  }
  render(<QueryClientProvider client={new QueryClient()}><SessionProvider>
    <AcceptResponse />
  </SessionProvider></QueryClientProvider>)
  fireEvent.click(screen.getByText('Accept confirmed update'))
  expect(observed).toBe('Second update')
})
