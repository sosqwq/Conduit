import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ArticleSummary, Profile } from '../lib/types'
import { ArticleList } from './ArticleList'
import { FavoriteButton, FollowButton } from './SocialButtons'

const author: Profile = { username: 'editor', bio: null, image: null, following: false }
const article: ArticleSummary = {
  title: 'Field guide', slug: 'field-guide', description: 'Notes', author, tagList: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', favoritesCount: 1, favorited: false,
}
let viewer: string | null = null
vi.mock('../auth/session', () => ({ useSession: () => ({ user: viewer ? { username: viewer } : null, token: null }) }))
const social = vi.hoisted(() => ({
  favorite: { active: false, count: 1, pending: false, errors: [] as string[], toggle: vi.fn() },
  follow: { active: false, pending: false, errors: [] as string[], toggle: vi.fn() },
}))
vi.mock('../lib/social', () => ({ useFavorite: () => social.favorite, useFollow: () => social.follow }))

beforeEach(() => {
  viewer = 'reader'
  Object.assign(social.favorite, { active: false, count: 1, pending: false, errors: [] })
  Object.assign(social.follow, { active: false, pending: false, errors: [] })
  vi.clearAllMocks()
})

it('labels the article favorite action, count and pressed state and disables it while a request settles', () => {
  const { rerender } = render(<FavoriteButton article={article} />)
  const initial = screen.getByRole('button', { name: /Favorite Article/ })
  expect(initial).toHaveClass('btn-outline-primary')
  expect(initial).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(initial)
  expect(social.favorite.toggle).toHaveBeenCalledOnce()
  Object.assign(social.favorite, { active: true, count: 2, pending: true })
  rerender(<FavoriteButton article={article} />)
  const pending = screen.getByRole('button', { name: /Unfavorite Article/ })
  expect(pending).toHaveClass('btn-primary')
  expect(pending).toBeDisabled()
  expect(pending).toHaveTextContent('2')
  Object.assign(social.favorite, { active: false, count: 1, pending: false, errors: ['Unable to connect. Please try again.'] })
  rerender(<FavoriteButton article={article} />)
  expect(screen.getByRole('alert')).toHaveClass('error-messages')
  expect(screen.getByRole('button', { name: /Favorite Article/ })).toBeEnabled()
})

it('provides follow and unfollow by name, hides self-follow, and keeps the control available to guests', () => {
  const { rerender } = render(<FollowButton profile={author} />)
  fireEvent.click(screen.getByRole('button', { name: 'Follow editor' }))
  expect(social.follow.toggle).toHaveBeenCalledOnce()
  Object.assign(social.follow, { active: true, pending: true })
  rerender(<FollowButton profile={author} />)
  expect(screen.getByRole('button', { name: 'Unfollow editor' })).toBeDisabled()
  viewer = 'editor'
  rerender(<FollowButton profile={author} />)
  expect(screen.queryByRole('button')).toBeNull()
  viewer = null
  Object.assign(social.follow, { active: false, pending: false })
  rerender(<FollowButton profile={author} />)
  expect(screen.getByRole('button', { name: 'Follow editor' })).toBeEnabled()
})

it('allows readers to favorite their own article directly in the list', async () => {
  viewer = 'editor'
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  client.setQueryData(['articles', 'editor', { kind: 'global' }, 1], { articles: [article], articlesCount: 1 })
  render(<QueryClientProvider client={client}><MemoryRouter><ArticleList filter={{kind: 'global'}} /></MemoryRouter></QueryClientProvider>)
  const compact = await screen.findByRole('button', { name: /Favorite Field guide/ })
  expect(compact).toHaveClass('btn-outline-primary')
  expect(compact.closest('.article-preview')).toBeInTheDocument()
  expect(compact.closest('a')).toBeNull()
  fireEvent.click(compact)
  expect(social.favorite.toggle).toHaveBeenCalledOnce()
})
