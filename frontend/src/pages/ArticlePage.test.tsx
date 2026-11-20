import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArticlePage } from './ArticlePage'

const author = { username: 'writer', image: null, bio: null, following: false }
const date = '2026-01-01T12:00:00Z'
const article = { slug: 'field-guide-1', title: 'Field guide', body: '**Markdown** and <b>embedded HTML</b>',
  description: 'A guide', tagList: ['notes'], createdAt: date, updatedAt: date, favorited: false, favoritesCount: 0, author }
const comment = { id: 9, author, body: 'Read this first', createdAt: date, updatedAt: date }
const path = '/api/articles/' + article.slug
let viewer: string | null = null
vi.mock('../auth/session', () => ({
  useSession: () => ({ status: viewer ? 'authenticated' : 'unauthenticated',
    token: viewer ? 'a-token' : null, user: viewer ? { username: viewer, image: null } : null }),
}))

const fetchMock = vi.fn<typeof fetch>()
function serve(mutate?: (url: string, init: RequestInit) => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (input, init = {}) => {
    const url = String(input)
    if ((init.method ?? 'GET') !== 'GET' && mutate) return mutate(url, init)
    if (url.endsWith(path + '/comments')) return Response.json({ comments: [comment] })
    if (url.endsWith(path)) return Response.json({ article })
    throw new Error('Unexpected URL: ' + url)
  })
}

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/article/' + article.slug]}>
    <Routes><Route path="/article/:slug" element={<ArticlePage />} />
      <Route index element={<h1>Home feed</h1>} /></Routes>
  </MemoryRouter></QueryClientProvider>)
}

describe('article details and comments', () => {
  beforeEach(() => { viewer = null; fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => vi.unstubAllGlobals())

  it('shows public Markdown, profile and tag links, with no guest editing controls', async () => {
    serve()
    const { container } = open()
    expect(await screen.findByRole('heading', { name: 'Field guide' })).toBeInTheDocument()
    expect(screen.getByText('Markdown').tagName).toBe('STRONG')
    expect(container.querySelector('.article-content b')).toBeNull()
    expect(screen.getByRole('link', { name: 'notes' })).toHaveAttribute('href', '/tag/notes')
    expect(container.querySelector('.article-meta .author')).toHaveAttribute('href', '/profile/writer')
    expect(container.querySelector('.article-meta img')).toHaveAttribute('src', expect.stringContaining('default-avatar.svg'))
    expect(await screen.findByText(comment.body)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Write a comment...')).not.toBeInTheDocument()
  })

  it('preserves the comment draft on failure, then prepends and clears on success', async () => {
    viewer = 'reader'
    let attempts = 0
    serve((url, init) => {
      expect(url).toMatch(/\/comments$/)
      expect(new Headers(init.headers).get('Authorization')).toBe('Token a-token')
      expect(JSON.parse(String(init.body))).toEqual({ comment: { body: 'My comment' } })
      if (++attempts === 1) throw new TypeError('Failed to fetch')
      return Response.json({ comment: { ...comment, id: 10, body: 'My comment', author: { ...author, username: viewer } } }, { status: 201 })
    })
    const { container } = open()
    await screen.findByText(comment.body)
    const input = screen.getByPlaceholderText('Write a comment...')
    fireEvent.change(input, { target: { value: 'My comment' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post Comment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect')
    expect(input).toHaveValue('My comment')
    fireEvent.click(screen.getByRole('button', { name: 'Post Comment' }))
    await waitFor(() => expect(input).toHaveValue(''))
    expect(container.querySelector('.card:not(.comment-form) .card-block')).toHaveTextContent('My comment')
    expect(screen.getAllByRole('button', { name: /delete comment/i })).toHaveLength(1)
  })

  it('keeps an owned comment on a forbidden delete and accepts an HTTP 200 retry', async () => {
    viewer = 'writer'
    let attempts = 0
    serve((url, init) => {
      expect(init.method).toBe('DELETE')
      expect(url).toMatch(/\/comments\/9$/)
      return ++attempts === 1
        ? Response.json({ errors: { comment: ['forbidden'] } }, { status: 403 }) : Response.json({})
    })
    open()
    fireEvent.click(await screen.findByRole('button', { name: /delete comment/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('forbidden')
    expect(screen.getByText(comment.body)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /delete comment/i }))
    await waitFor(() => expect(screen.queryByText(comment.body)).toBeNull())
    expect(screen.getByRole('heading', { name: 'Field guide' })).toBeVisible()
  })

  it('shows editor and delete actions to the author and returns home after deletion', async () => {
    viewer = 'writer'
    serve((url, init) => {
      expect(url).toMatch(/\/api\/articles\/field-guide-1$/)
      expect(init.method).toBe('DELETE')
      return new Response(null, { status: 204 })
    })
    open()
    expect(await screen.findByRole('link', { name: 'Edit Article' })).toHaveAttribute('href', '/editor/field-guide-1')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Article' }))
    expect(await screen.findByRole('heading', { name: 'Home feed' })).toBeVisible()
  })

  it('keeps the article page visible if a requested article was removed', async () => {
    fetchMock.mockResolvedValue(Response.json({ errors: { article: ['not found'] } }, { status: 404 }))
    const { container } = open()
    expect(await within(container).findByRole('alert')).toHaveTextContent(/not found/i)
    expect(container.querySelector('.article-page')).toBeVisible()
  })
})
