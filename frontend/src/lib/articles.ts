import { queryOptions } from '@tanstack/react-query'
import { api } from './api'
import type { Article } from './types'

export function articleKey(slug: string, username: string | null) {
  return ['article', slug, username] as const
}

export function articleQuery(slug: string, username: string | null, token: string | null) {
  return queryOptions({
    queryKey: articleKey(slug, username),
    queryFn: async ({ signal }) => {
      const { article } = await api<{ article: Article }>(`/articles/${encodeURIComponent(slug)}`, { token, signal })
      return article
    },
  })
}
