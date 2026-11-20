import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from '../App'
import { SessionProvider } from '../auth/session'

function openAtCurrentAddress() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><BrowserRouter>
    <SessionProvider><App /></SessionProvider>
  </BrowserRouter></QueryClientProvider>)
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

it.each([
  ['.', '/tag?tag=.'],
  ['..', '/tag?tag=..'],
  ['100%2F', '/tag?tag=100%252F'],
  ['x/../y', '/tag?tag=x%2F..%2Fy'],
  ['C/C++', '/tag/C%2FC%2B%2B'],
  ['中文', '/tag/%E4%B8%AD%E6%96%87'],
])('retains the exact tag %s through both links, pagination, refresh and tab reset', async (tag, address) => {
  const article = {
    slug: 'guide', title: 'Guide', body: 'text', description: 'intro', tagList: [tag],
    createdAt: '2026-01-01', updatedAt: '2026-01-01', author: { username: 'writer', image: null, following: false },
    favoritesCount: 0, favorited: false,
  }
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    const url = new URL(path, window.location.origin)
    switch (url.pathname) {
      case '/api/articles/guide': return Response.json({ article })
      case '/api/articles/guide/comments': return Response.json({ comments: [] })
      case '/api/tags': return Response.json({ tags: [tag] })
      case '/api/articles': {
        const filter = url.searchParams.get('tag')
        const offset = url.searchParams.get('offset')
        return Response.json({
          articles: [{ ...article, title: filter === tag ? 'Tagged at ' + offset : 'Unfiltered' }],
          articlesCount: 12,
        })
      }
      default: throw new Error('Unexpected request ' + url)
    }
  }))
  window.history.replaceState(null, '', '/article/guide')
  const detail = openAtCurrentAddress()
  const articleTag = await screen.findByRole('link', { name: tag })
  expect(articleTag).toHaveAttribute('href', address)
  fireEvent.click(articleTag)
  expect(await screen.findByRole('heading', { name: 'Tagged at 0' })).toBeVisible()

  const pages = screen.getByRole('navigation', { name: 'Article pages' })
  const pageTwo = within(pages).getByRole('link', { name: '2' })
  const nextPage = address + (address.includes('?') ? '&' : '?') + 'page=2'
  expect(pageTwo).toHaveAttribute('href', nextPage)
  fireEvent.click(pageTwo)
  expect(await screen.findByRole('heading', { name: 'Tagged at 10' })).toBeVisible()
  expect(window.location.pathname + window.location.search).toBe(nextPage)

  detail.unmount()
  openAtCurrentAddress()
  expect(await screen.findByRole('heading', { name: 'Tagged at 10' })).toBeVisible()
  const tab = screen.getByRole('link', { name: '# ' + tag })
  expect(tab).toHaveAttribute('href', address)
  fireEvent.click(tab)
  expect(await screen.findByRole('heading', { name: 'Tagged at 0' })).toBeVisible()

  fireEvent.click(screen.getByRole('link', { name: 'Global Feed' }))
  expect(await screen.findByRole('heading', { name: 'Unfiltered' })).toBeVisible()
  const sideTag = within(screen.getByRole('complementary', { name: 'Popular tags' })).getByRole('link', { name: tag })
  expect(sideTag).toHaveAttribute('href', address)
  fireEvent.click(sideTag)
  expect(await screen.findByRole('heading', { name: 'Tagged at 0' })).toBeVisible()
})
