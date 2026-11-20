import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionProvider } from '../auth/session'
import { HomePage } from './HomePage'

const writer = { username: 'writer', email: 'writer@example.test', image: null, bio: null, token: 'jwt' }
function item(title: string) {
  return {
    title, slug: 'some-article', description: 'An introduction', tagList: ['Java API'],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    author: { username: 'writer', image: null, bio: null, following: false }, favoritesCount: 0, favorited: false,
  }
}

function Location() {
  const path = useLocation()
  const navigate = useNavigate()
  return <><output>{path.pathname}{path.search}</output><button onClick={() => navigate(-1)}>Back</button></>
}

function open(path: string, respond: (url: URL, options?: RequestInit) => Response) {
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => Promise.resolve(respond(new URL(url, 'http://localhost'), options))))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><SessionProvider><Location /><Routes>
      <Route index element={<HomePage />} /><Route path="tag/:tag" element={<HomePage />} />
    </Routes></SessionProvider></MemoryRouter>
  </QueryClientProvider>)
}

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

it('uses the encoded tag and URL page, resets when switching tabs, and restores browser history', async () => {
  const calls: URL[] = []
  open('/tag/Java%20API?page=2', url => {
    if (url.pathname === '/api/tags') return Response.json({ tags: ['Java API'] })
    calls.push(url)
    return Response.json({
      articles: [item(url.searchParams.get('tag') ? 'Tagged article' : 'Global article')], articlesCount: 23,
    })
  })
  expect(await screen.findByRole('heading', { name: 'Tagged article' })).toBeVisible()
  expect(calls[0].searchParams.get('tag')).toBe('Java API')
  expect(calls[0].searchParams.get('offset')).toBe('10')
  expect(calls[0].searchParams.get('limit')).toBe('10')
  const pages = screen.getByRole('navigation', { name: 'Article pages' })
  expect(within(pages).getByRole('link', { current: 'page' })).toHaveTextContent('2')
  expect(within(pages).getByRole('link', { name: '3' })).toHaveAttribute('href', '/tag/Java%20API?page=3')
  fireEvent.click(screen.getByRole('link', { name: 'Global Feed' }))
  await screen.findByRole('heading', { name: 'Global article' })
  expect(screen.getByText('/', { selector: 'output' })).toBeVisible()
  fireEvent.click(screen.getByText('Back'))
  expect(await screen.findByRole('heading', { name: 'Tagged article' })).toBeVisible()
  expect(screen.getByText('/tag/Java%20API?page=2', { selector: 'output' })).toBeVisible()
})

it('requests the personal feed with the validated token and offers an empty-feed exit', async () => {
  localStorage.setItem('jwtToken', 'jwt')
  let sentToken: string | null = null
  open('/?feed=following', (url, options) => {
    if (url.pathname === '/api/user') return Response.json({ user: writer })
    if (url.pathname === '/api/tags') return Response.json({ tags: [] })
    if (url.pathname === '/api/articles/feed') sentToken = new Headers(options?.headers).get('Authorization')
    return Response.json({ articles: [], articlesCount: 0 })
  })
  await screen.findByText(/Your feed is empty/)
  expect(sentToken).toBe('Token jwt')
  expect(screen.getByRole('link', { name: 'Your Feed' })).toHaveAttribute('aria-current', 'page')
  expect(within(screen.getByText(/Your feed is empty/)).getByRole('link')).toHaveAttribute('href', '/')
})

it('retries a failed article query while tags and navigation remain available', async () => {
  let failed = true
  open('/?page=-4', url => {
    if (url.pathname === '/api/tags') return Response.json({ tags: ['systems'] })
    expect(url.searchParams.get('offset')).toBe('0')
    return failed ? new Response('', { status: 503 }) : Response.json({ articles: [item('Recovered article')], articlesCount: 1 })
  })
  const alert = await screen.findByRole('alert')
  expect(await screen.findByRole('link', { name: 'systems' })).toHaveAttribute('href', '/tag/systems')
  failed = false
  fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('heading', { name: 'Recovered article' })).toBeVisible()
})
