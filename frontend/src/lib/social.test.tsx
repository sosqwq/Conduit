import { QueryClient, QueryClientProvider, skipToken, useQuery } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useFavorite, useFollow } from './social'
import type { Article, ArticleList, Profile } from './types'

const user = { username: 'reader' }
let viewer: typeof user | null
vi.mock('../auth/session', () => ({ useSession: () => ({ user: viewer, token: viewer ? 'jwt' : null }) }))
const network = vi.fn<typeof fetch>()
beforeEach(() => { viewer = user; network.mockReset(); vi.stubGlobal('fetch', network) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const author: Profile = { username: 'author', bio: null, image: null, following: false }
function article(slug: string): Article {
  return { slug, title: slug, body: 'text', description: 'summary', author, tagList: [], favorited: false,
    favoritesCount: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
}
const one = article('one')
const two = article('two')
const detailKey = (slug: string) => ['article', slug, 'reader']
const listKey = ['articles', 'reader', { kind: 'global' }, 1]
const profileKey = ['profile', 'author', 'reader']
const commentKey = ['comments', 'one', 'reader']

function Card({ row, label }: { row: Article; label: string }) {
  const detail = useQuery<Article>({ queryKey: detailKey(row.slug), queryFn: skipToken })
  const favorite = useFavorite(detail.data ?? row)
  return <>
    <button aria-label={label} disabled={favorite.pending} onClick={favorite.toggle}>{favorite.active ? 'on' : 'off'} {favorite.count}</button>
    {favorite.errors.map(e => <p key={e}>{e}</p>)}
  </>
}
function Follow() {
  const query = useQuery<{ profile: Profile }>({ queryKey: profileKey, queryFn: skipToken })
  const follow = useFollow(query.data?.profile ?? author)
  return <button onClick={follow.toggle} disabled={follow.pending}>{follow.active ? 'Unfollow' : 'Follow'}</button>
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(detailKey('one'), one)
  client.setQueryData(detailKey('two'), two)
  client.setQueryData(listKey, { articles: [one, two], articlesCount: 2 })
  client.setQueryData(profileKey, { profile: author })
  client.setQueryData(commentKey, [{ id: 1, author }])
  render(<QueryClientProvider client={client}><MemoryRouter><Routes>
    <Route path="/" element={<><Card row={one} label="first" /><Card row={one} label="same" /><Card row={two} label="second" /><Follow /></>} />
    <Route path="/login" element={<p>Sign in here</p>} />
  </Routes></MemoryRouter></QueryClientProvider>)
  return client
}

function deferRequest() {
  let finish!: (response: Response) => void
  const promise = new Promise<Response>(resolve => { finish = resolve })
  network.mockReturnValueOnce(promise)
  return finish
}

it('shares pending state and sends only one request for duplicate controls', async () => {
  const finish = deferRequest()
  const client = show()
  const first = screen.getByRole('button', { name: 'first' })
  const same = screen.getByRole('button', { name: 'same' })
  act(() => { first.click(); same.click() })
  await waitFor(() => expect(same).toHaveTextContent('on 3'))
  expect(first).toBeDisabled()
  expect(same).toBeDisabled()
  expect(network).toHaveBeenCalledTimes(1)
  const [url, options] = network.mock.calls[0]
  expect(url).toBe('/api/articles/one/favorite')
  expect(options?.method).toBe('POST')
  finish(Response.json({ article: { ...one, favorited: true, favoritesCount: 6 } }))
  await waitFor(() => expect(same).toHaveTextContent('on 6'))
  expect(client.getQueryData<ArticleList>(listKey)?.articles[0].favoritesCount).toBe(6)
  expect(client.getQueryState(listKey)?.isInvalidated).toBe(true)
})

it('a failed favorite rolls back only that article while a different favorite succeeds', async () => {
  const finishOne = deferRequest()
  const finishTwo = deferRequest()
  const client = show()
  fireEvent.click(screen.getByRole('button', { name: 'first' }))
  fireEvent.click(screen.getByRole('button', { name: 'second' }))
  await waitFor(() => expect(network).toHaveBeenCalledTimes(2))
  finishTwo(Response.json({ article: { ...two, favorited: true, favoritesCount: 3 } }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'second' })).toBeEnabled())
  finishOne(Response.json({ errors: { article: ['forbidden'] } }, { status: 403 }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveTextContent('off 2'))
  expect(screen.getByRole('button', { name: 'second' })).toHaveTextContent('on 3')
  expect(client.getQueryData<ArticleList>(listKey)?.articles.map(a => a.favorited)).toEqual([false, true])
  expect(screen.getAllByText(/forbidden/).length).toBeGreaterThan(0)
})

it('merges following into profile, comment and article authors while keeping favorite changes', async () => {
  const completeFollow = deferRequest()
  const completeFavorite = deferRequest()
  const client = show()
  fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
  fireEvent.click(screen.getByRole('button', { name: 'first' }))
  expect(await screen.findByRole('button', { name: 'Unfollow' })).toBeDisabled()
  completeFollow(Response.json({ profile: { ...author, following: true } }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Unfollow' })).toBeEnabled())
  completeFavorite(Response.json({ article: { ...one, favorited: true, favoritesCount: 3 } }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toBeEnabled())
  expect(client.getQueryData<Article>(detailKey('one'))?.author.following).toBe(true)
  expect(client.getQueryData<ArticleList>(listKey)?.articles.every(a => a.author.following)).toBe(true)
  expect(client.getQueryData<{ author: Profile }[]>(commentKey)?.[0].author.following).toBe(true)
})

it('does not re-create old account data after the session clears the cache', async () => {
  const finish = deferRequest()
  const client = show()
  fireEvent.click(screen.getByRole('button', { name: 'first' }))
  await waitFor(() => expect(network).toHaveBeenCalledOnce())
  act(() => { viewer = null; client.clear() })
  await act(async () => { finish(Response.json({ article: { ...one, favorited: true } })); await Promise.resolve() })
  expect(client.getQueryData(detailKey('one'))).toBeUndefined()
  expect(client.getQueryData(listKey)).toBeUndefined()
})

it('sends guests to login without attempting to change an article', async () => {
  viewer = null
  show()
  fireEvent.click(screen.getByRole('button', { name: 'first' }))
  expect(await screen.findByText('Sign in here')).toBeVisible()
  expect(network).not.toHaveBeenCalled()
})

it('unfavoriting revalidates global, author, favorites and following pages only for the current viewer', async () => {
  const finish = deferRequest()
  const client = show()
  const filters = [{ kind: 'global' }, { kind: 'author', value: 'author' },
    { kind: 'favorited', value: 'reader' }, { kind: 'following' }]
  const active = { ...one, favorited: true, favoritesCount: 3 }
  act(() => {
    client.setQueryData(detailKey('one'), active)
    for (const filter of filters) {
      client.setQueryData(['articles', 'reader', filter, 1], { articles: [active], articlesCount: 1 })
      client.setQueryData(['articles', 'other', filter, 1], { articles: [one], articlesCount: 1 })
    }
  })
  const button = screen.getByRole('button', { name: 'first' })
  await waitFor(() => expect(button).toHaveTextContent('on 3'))
  fireEvent.click(button)
  await waitFor(() => expect(button).toHaveTextContent('off 2'))
  expect(network.mock.calls[0][1]?.method).toBe('DELETE')
  finish(Response.json({ article: one }))
  await waitFor(() => expect(button).toBeEnabled())
  for (const filter of filters) {
    expect(client.getQueryState(['articles', 'reader', filter, 1])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['articles', 'other', filter, 1])?.isInvalidated).toBe(false)
  }
})

it('restores a follow button after failure so the user can retry', async () => {
  const first = deferRequest()
  const second = deferRequest()
  const client = show()
  fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
  expect(await screen.findByRole('button', { name: 'Unfollow' })).toBeDisabled()
  first(Response.json({ errors: { profile: ['forbidden'] } }, { status: 403 }))
  const retry = await screen.findByRole('button', { name: 'Follow' })
  expect(retry).toBeEnabled()
  expect(client.getQueryData<{ profile: Profile }>(profileKey)?.profile.following).toBe(false)
  fireEvent.click(retry)
  second(Response.json({ profile: { ...author, following: true } }))
  await waitFor(() => expect(client.getQueryData<{ profile: Profile }>(profileKey)?.profile.following).toBe(true))
})
