import { useMutation, useMutationState, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../auth/session'
import { api, errorMessages } from './api'
import type { Article, ArticleList, ArticleSummary, Comment, Profile } from './types'

type Kind = 'favorite' | 'follow'
type Confirmed =
  | { kind: 'favorite'; article: Article }
  | { kind: 'follow'; profile: Profile }

function mergeArticle<T extends ArticleSummary>(article: T, change: Confirmed): T {
  if (change.kind === 'favorite' && article.slug === change.article.slug) {
    return { ...article, favorited: change.article.favorited, favoritesCount: change.article.favoritesCount }
  }
  if (change.kind === 'follow' && article.author.username === change.profile.username) {
    return { ...article, author: { ...article.author, following: change.profile.following } }
  }
  return article
}

function applyConfirmation(client: QueryClient, viewer: string, change: Confirmed) {
  client.setQueriesData<Article>({
    predicate: ({ queryKey: [kind, slug, owner] }) =>
      kind === 'article' && owner === viewer && (change.kind === 'follow' || slug === change.article.slug),
  }, old => old && mergeArticle(old, change))
  client.setQueriesData<ArticleList>({ queryKey: ['articles', viewer] }, old =>
    old && { ...old, articles: old.articles.map(article => mergeArticle(article, change)) })

  if (change.kind === 'follow') {
    const { profile } = change
    client.setQueriesData<{ profile: Profile }>({ queryKey: ['profile', profile.username, viewer], exact: true },
      old => old && { profile: { ...old.profile, following: profile.following } })
    client.setQueriesData<Comment[]>({
      predicate: ({ queryKey: [kind, , owner] }) => kind === 'comments' && owner === viewer,
    }, old => old?.map(comment => comment.author.username === profile.username
      ? { ...comment, author: { ...comment.author, following: profile.following } }
      : comment))
  }

  // Only the server knows which row should fill a page when a filtered membership changes.
  void client.invalidateQueries({ queryKey: ['articles', viewer] })
  // Replace overlapping detail reads that started before the write committed.
  void client.invalidateQueries({
    predicate: query => {
      const [kind, target, owner] = query.queryKey
      if (owner !== viewer || query.state.fetchStatus !== 'fetching') return false
      if (change.kind === 'favorite') return kind === 'article' && target === change.article.slug
      return kind === 'article' || kind === 'comments' || (kind === 'profile' && target === change.profile.username)
    },
  })
}

function useSocial(kind: Kind, target: string, current: boolean) {
  const { user, token } = useSession()
  const viewer = user?.username ?? null
  const client = useQueryClient()
  const navigate = useNavigate()
  const key = ['social', viewer, kind, target]
  const selection = { mutationKey: key, exact: true }
  const mutation = useMutation({
    mutationKey: key,
    mutationFn: async ({ next }: { next: boolean }): Promise<Confirmed> => {
      const method = next ? 'POST' : 'DELETE'
      const name = encodeURIComponent(target)
      if (kind === 'favorite') {
        const { article } = await api<{ article: Article }>(`/articles/${name}/favorite`, { method, token })
        return { kind, article }
      }
      const { profile } = await api<{ profile: Profile }>(`/profiles/${name}/follow`, { method, token })
      return { kind, profile }
    },
    onSuccess: (change, operation) => {
      // Logging out or switching accounts clears this mutation from the cache, even if its HTTP call finishes later.
      const sameSession = client.getMutationCache().find({ ...selection, predicate: m => m.state.variables === operation })
      if (viewer && sameSession) applyConfirmation(client, viewer, change)
    },
  })

  // Pending changes are overlays on server data; failure drops one overlay without restoring an old page.
  const attempts = useMutationState({
    filters: selection,
    select: m => ({ status: m.state.status, next: (m.state.variables as { next: boolean }).next, error: m.state.error }),
  })
  const latest = attempts.at(-1)
  const pending = latest?.status === 'pending'
  function toggle() {
    if (!user || !token) { navigate('/login'); return }
    if (!client.isMutating(selection)) mutation.mutate({ next: !current })
  }
  return {
    active: pending ? latest.next : current,
    pending,
    toggle,
    errors: latest?.status === 'error' ? errorMessages(latest.error) : [],
  }
}

export function useFavorite(article: ArticleSummary) {
  const state = useSocial('favorite', article.slug, article.favorited)
  return { ...state, count: Math.max(0, article.favoritesCount + Number(state.active) - Number(article.favorited)) }
}

export function useFollow(profile: Profile) {
  return useSocial('follow', profile.username, profile.following)
}
