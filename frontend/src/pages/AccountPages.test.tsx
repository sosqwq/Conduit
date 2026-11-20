import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage, RegisterPage, SettingsPage } from './AccountPages'

const account = {
  username: 'ada', email: 'ada@example.test', bio: 'Writer', image: 'https://example.test/ada',
  token: 'initial-token',
}
const accept = vi.fn()
const logout = vi.fn()
vi.mock('../auth/session', () => ({
  useSession: () => ({ user: account, token: account.token, accept, logout }),
}))

function Location() {
  return <output>{useLocation().pathname}</output>
}

function open(path: '/login' | '/register' | '/settings') {
  render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Location />} />
    </Routes>
  </MemoryRouter>)
}

const fetchMock = vi.fn<typeof fetch>()
function edit(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
}

describe('account forms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('registers once and goes home after accepting the returned account', async () => {
    let finishRequest!: (response: Response) => void
    fetchMock.mockImplementation(() => new Promise(resolve => { finishRequest = resolve }))
    open('/register')
    edit('Username', 'ada')
    edit('Email', account.email)
    edit('Password', 'password123')
    const button = screen.getByRole('button', { name: 'Sign up' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/users$/)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ user: { username: 'ada', email: account.email, password: 'password123' } })
    expect(button).toBeDisabled()
    finishRequest(Response.json({ user: account }, { status: 201 }))
    await waitFor(() => expect(accept).toHaveBeenCalledWith(account))
    expect(await screen.findByText('/')).toBeInTheDocument()
  })

  it('keeps login credentials editable after network errors and permits a retry', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce(Response.json({ user: account }))
    open('/login')
    edit('Email', account.email)
    edit('Password', 'password123')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect')
    expect(screen.getByLabelText('Email')).toHaveValue(account.email)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('/')).toBeInTheDocument()
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/api\/users\/login$/)
  })

  it('clears optional profile fields, omits a blank password and navigates to the returned username', async () => {
    const updated = { ...account, username: 'new-name', image: null, bio: null, token: 'renewed' }
    fetchMock.mockResolvedValueOnce(Response.json({ user: updated }))
    open('/settings')
    expect(screen.getByLabelText('Bio')).toHaveValue('Writer')
    edit('Bio', '')
    edit('Profile image URL', '')
    edit('Username', 'new-name')
    fireEvent.click(screen.getByRole('button', { name: 'Update Settings' }))
    expect(await screen.findByText('/profile/new-name')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/user$/)
    expect(init?.method).toBe('PUT')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Token initial-token')
    expect(JSON.parse(String(init?.body))).toEqual({ user: { bio: null, image: null, username: 'new-name' } })
    expect(accept).toHaveBeenCalledWith(updated)
  })

  it.each([401, 422, 500])('retains the settings form and displays HTTP %i errors', async status => {
    fetchMock.mockResolvedValueOnce(Response.json({ errors: { email: ['could not be updated'] } }, { status }))
    open('/settings')
    edit('Email', 'change@example.test')
    fireEvent.click(screen.getByRole('button', { name: 'Update Settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be updated')
    expect(screen.getByLabelText('Email')).toHaveValue('change@example.test')
    expect(screen.getByRole('button', { name: 'Update Settings' })).toBeEnabled()
    expect(accept).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
  })

  it('logs out from settings and returns home', async () => {
    open('/settings')
    fireEvent.click(screen.getByRole('button', { name: 'Or click here to logout' }))
    expect(logout).toHaveBeenCalledOnce()
    expect(await screen.findByText('/')).toBeInTheDocument()
  })
})
