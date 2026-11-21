import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionProvider } from '../auth/session'
import { HomePage, TagPage } from './HomePage'

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

function open(path: string, respond: (url: URL, options?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => Promise.resolve(respond(new URL(url, 'http://localhost'), options))))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><SessionProvider><Location /><Routes>
      <Route index element={<HomePage />} /><Route path="tag/:tag?" element={<TagPage />} />
    </Routes></SessionProvider></MemoryRouter>
  </QueryClientProvider>)
}

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

it('links the cover to the feed and gives readers a real destination when the publication is empty', async () => {
  open('/', url => Response.json(url.pathname === '/api/tags' ? { tags: [] } : { articles: [], articlesCount: 0 }))
  const cover = screen.getByRole('heading', { name: 'conduit', level: 1 }).closest<HTMLElement>('.banner')!
  expect(cover).toHaveTextContent('A place to share your knowledge.')
  const feed = screen.getByRole('region', { name: 'Article feed' })
  expect(feed).toHaveAttribute('id', 'article-feed')
  expect(within(cover).getByRole('link', { name: 'Browse articles' })).toHaveAttribute('href', '#article-feed')
  const empty = (await screen.findByText('No articles here yet.')).closest<HTMLElement>('.empty-feed-message')!
  expect(within(empty).getByRole('link', { name: 'Read the tutorial' })).toHaveAttribute('href', '/tutorial')
  const topics = screen.getByRole('complementary', { name: 'Popular tags' })
  expect(within(topics).getByText('Tags will appear here as articles are published.')).toBeVisible()
})

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

it('returns to the last available page when the requested page no longer exists', async () => {
  open('/tag/news?page=9', url => {
    if (url.pathname === '/api/tags') return Response.json({ tags: ['news'] })
    return Response.json({
      articles: url.searchParams.get('offset') === '10' ? [item('Last article')] : [],
      articlesCount: 11,
    })
  })
  expect(await screen.findByRole('heading', { name: 'Last article' })).toBeVisible()
  expect(screen.getByText('/tag/news?page=2', { selector: 'output' })).toBeVisible()
})

it.each([200, 503])('waits for identity before fetching the public feed, even if validation returns %i', async status => {
  localStorage.setItem('jwtToken', 'jwt')
  let finish!: (response: Response) => void
  const validation = new Promise<Response>(resolve => { finish = resolve })
  const requests: (string | null)[] = []
  open('/', (url, options) => {
    if (url.pathname === '/api/user') return validation
    if (url.pathname === '/api/tags') return Response.json({ tags: [] })
    requests.push(new Headers(options?.headers).get('Authorization'))
    return Response.json({ articles: [item('Selected feed')], articlesCount: 1 })
  })
  expect(requests).toEqual([])
  await act(async () => { finish(status === 200 ? Response.json({ user: writer }) : new Response('', { status })) })
  expect(await screen.findByRole('heading', { name: 'Selected feed' })).toBeVisible()
  expect(requests).toEqual([status === 200 ? 'Token jwt' : null])
})

it('opens a historical percent-encoded path without converting a literal %2F into a slash', async () => {
  open('/tag/100%252F?page=2', url => {
    if (url.pathname === '/api/tags') return Response.json({ tags: [] })
    const title = url.searchParams.get('tag') + ' at ' + url.searchParams.get('offset')
    return Response.json({ articles: [item(title)], articlesCount: 11 })
  })
  expect(await screen.findByRole('heading', { name: '100%2F at 10' })).toBeVisible()
  expect(screen.getByRole('link', { name: '# 100%2F' })).toHaveAttribute('href', '/tag?tag=100%252F')
})
