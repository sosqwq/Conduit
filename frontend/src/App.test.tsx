import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { SessionProvider } from './auth/session'

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

it('redirects guests entering the following feed directly to sign in', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ articles: [], articlesCount: 0 })))
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/?feed=following']}><SessionProvider><App /></SessionProvider></MemoryRouter>
    </QueryClientProvider>,
  )
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible()
})
