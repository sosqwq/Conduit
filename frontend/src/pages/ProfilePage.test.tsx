import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from '../App'
import { SessionProvider } from '../auth/session'

const user = { username: 'mei', email: 'mei@example.test', image: null, bio: null, token: 'token-mei' }
const person = { username: 'mei', image: null, bio: null, following: false }
const article = {
  slug: 'note', title: 'A note', description: 'Reading notes', tagList: [], author: person,
  createdAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-01T12:00:00Z', favorited: false, favoritesCount: 0,
}

function open(path: string, handler: (url: URL, init: RequestInit) => Response) {
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) =>
    Promise.resolve(handler(new URL(url, 'http://localhost'), init))))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <SessionProvider><App /></SessionProvider>
  </MemoryRouter></QueryClientProvider>)
}
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

it('loads a bookmarked favorites page and resets pagination on the author tab', async () => {
  localStorage.setItem('jwtToken', user.token)
  const requests: URL[] = []
  open('/profile/mei/favorites?page=2', (url, init) => {
    if (url.pathname === '/api/user') return Response.json({ user })
    if (url.pathname === '/api/profiles/mei') {
      expect(new Headers(init.headers).get('Authorization')).toBe('Token token-mei')
      return Response.json({ profile: person })
    }
    requests.push(url)
    const title = url.searchParams.has('favorited') ? 'Saved article' : 'Own article'
    return Response.json({ articles: [{ ...article, title }], articlesCount: 12 })
  })
  expect(await screen.findByRole('heading', { name: 'Saved article' })).toBeVisible()
  expect(requests[0].searchParams.get('favorited')).toBe('mei')
  expect(requests[0].searchParams.get('offset')).toBe('10')
  expect(screen.getByRole('link', { name: 'Favorited Articles', current: 'page' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Edit Profile Settings' })).toHaveAttribute('href', '/settings')
  expect(screen.queryByRole('button', { name: /follow/i })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'My Articles' }))
  await screen.findByRole('heading', { name: 'Own article' })
  expect(requests.at(-1)?.searchParams.get('author')).toBe('mei')
  expect(requests.at(-1)?.searchParams.get('offset')).toBe('0')
})

it('shows a guest the public profile with empty bio, fallback avatar and follow action', async () => {
  const { container } = open('/profile/mei', url => {
    if (url.pathname === '/api/profiles/mei') return Response.json({ profile: person })
    return Response.json({ articles: [], articlesCount: 0 })
  })
  expect(await screen.findByRole('button', { name: /follow mei/i })).toBeVisible()
  expect(await screen.findByRole('heading', { name: 'mei' })).toBeVisible()
  expect(container.querySelector('.user-info p')).toHaveTextContent(/^$/)
  expect(container.querySelector('.user-img')?.getAttribute('src')).toContain('default-avatar.svg')
  expect(screen.queryByRole('link', { name: 'Edit Profile Settings' })).not.toBeInTheDocument()
})

it('recovers when a profile request fails and never shows a different user on error', async () => {
  let found = false
  const { container } = open('/profile/mei', url => {
    if (url.pathname === '/api/profiles/mei') {
      return found ? Response.json({ profile: person }) : new Response('', { status: 404 })
    }
    return Response.json({ articles: [], articlesCount: 0 })
  })
  expect(await screen.findByRole('alert')).toHaveTextContent(/not found/i)
  expect(container.querySelectorAll('.profile-page, .user-info')).toHaveLength(1)
  found = true
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('heading', { name: 'mei' })).toBeVisible()
})
