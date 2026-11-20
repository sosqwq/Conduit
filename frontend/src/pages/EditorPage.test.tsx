import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EditorPage } from './EditorPage'
import type { Article } from '../lib/types'

vi.mock('../auth/session', () => ({
  useSession: () => ({ user: { username: 'writer' }, status: 'authenticated', token: 'jwt' }),
}))
const original: Article = {
  slug: 'old-1', title: 'Old title', description: 'Summary', body: 'Body', tagList: ['one', 'two'],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  favorited: false, favoritesCount: 0, author: { username: 'writer', bio: null, image: null, following: false },
}
const network = vi.fn<typeof fetch>()
beforeEach(() => { network.mockReset(); vi.stubGlobal('fetch', network) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function Destination() {
  return <output>{useLocation().pathname}</output>
}

function open(path = '/editor') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/editor/:slug?" element={<EditorPage />} />
      <Route path="*" element={<Destination />} />
    </Routes>
  </MemoryRouter></QueryClientProvider>)
  return client
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

it('creates an article, adds tags once with Enter and stores the returned detail', async () => {
  const published = { ...original, slug: 'published-7', tagList: ['news'] }
  network.mockResolvedValueOnce(Response.json({ article: published }, { status: 201 }))
  const client = open()
  fill('Article title', 'Old title')
  fill('Description', 'Summary')
  fill('Article body', 'Body')
  const input = screen.getByPlaceholderText('Enter tags')
  for (const value of [' news ', 'news']) {
    fireEvent.change(input, { target: { value } })
    fireEvent.keyDown(input, { key: 'Enter' })
  }
  expect(network).not.toHaveBeenCalled()
  expect(screen.getAllByRole('button', { name: 'Remove news' })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Publish Article' }))
  expect(await screen.findByText('/article/published-7')).toBeVisible()
  const [url, options] = network.mock.calls[0]
  expect(String(url)).toBe('/api/articles')
  expect(options?.method).toBe('POST')
  expect(new Headers(options?.headers).get('Authorization')).toBe('Token jwt')
  expect(JSON.parse(String(options?.body))).toEqual({ article: {
    title: 'Old title', description: 'Summary', body: 'Body', tagList: ['news'],
  } })
  expect(client.getQueryData(['article', 'published-7', 'writer'])).toEqual(published)
})

it('loads existing content, sends an empty tag list and uses the server slug after rename', async () => {
  const revised = { ...original, slug: 'new-1', title: 'New title', tagList: [] }
  network.mockResolvedValueOnce(Response.json({ article: original }))
  network.mockResolvedValueOnce(Response.json({ article: revised }))
  const client = open('/editor/old-1')
  await screen.findByDisplayValue('Old title')
  fill('Article title', 'New title')
  fireEvent.click(screen.getByRole('button', { name: 'Remove one' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove two' }))
  fireEvent.click(screen.getByRole('button', { name: 'Publish Article' }))
  expect(await screen.findByText('/article/new-1')).toBeVisible()
  const [url, options] = network.mock.calls[1]
  expect(String(url)).toBe('/api/articles/old-1')
  expect(options?.method).toBe('PUT')
  expect(JSON.parse(String(options?.body)).article.tagList).toEqual([])
  expect(client.getQueryData(['article', 'old-1', 'writer'])).toBeUndefined()
  expect(client.getQueryData(['article', 'new-1', 'writer'])).toEqual(revised)
})

it('retains the draft after validation and network failures and permits a retry', async () => {
  network.mockResolvedValueOnce(Response.json({ errors: { title: ["can't be blank"] } }, { status: 422 }))
  network.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  network.mockResolvedValueOnce(Response.json({ article: original }, { status: 201 }))
  open()
  fill('Article body', 'Do not lose this draft')
  const button = screen.getByRole('button', { name: 'Publish Article' })
  fireEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent("title can't be blank")
  fill('Article title', 'Fixed title')
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to connect'))
  expect(screen.getByLabelText('Article body')).toHaveValue('Do not lose this draft')
  fireEvent.click(button)
  expect(await screen.findByText('/article/old-1')).toBeVisible()
})

it('reports an error and offers a retry if the edit target could not be loaded', async () => {
  network.mockResolvedValueOnce(new Response('', { status: 503 }))
  network.mockResolvedValueOnce(Response.json({ article: original }))
  open('/editor/old-1')
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Publish Article' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByDisplayValue('Old title')).toBeVisible()
})
