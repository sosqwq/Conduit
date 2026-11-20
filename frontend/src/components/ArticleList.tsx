import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useSession } from '../auth/session'
import { api } from '../lib/api'
import { avatar } from '../lib/avatar'
import type { ArticleList as ArticleListResponse, ArticleSummary } from '../lib/types'

export type ArticleFilter =
  | { kind: 'global' | 'following' }
  | { kind: 'tag' | 'author' | 'favorited'; value: string }

const pageSize = 10
const dateFormat = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' })

function pageNumber(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw)) return 1
  const page = Number(raw)
  return page > 0 && (page - 1) * pageSize <= 2147483647 ? page : 1
}

function articlesPath(filter: ArticleFilter, page: number) {
  const params = new URLSearchParams()
  if ('value' in filter) params.set(filter.kind, filter.value)
  params.set('limit', String(pageSize))
  params.set('offset', String((page - 1) * pageSize))
  const endpoint = filter.kind === 'following' ? '/articles/feed' : '/articles'
  return `${endpoint}?${params}`
}

function ArticlePreview({ article }: { article: ArticleSummary }) {
  const profilePath = `/profile/${encodeURIComponent(article.author.username)}`
  return <div className="article-preview">
    <div className="article-meta">
      <Link to={profilePath} aria-label={`${article.author.username}'s profile`}>
        <img alt="" src={avatar(article.author.image)} />
      </Link>
      <div className="info">
        <Link className="author" to={profilePath}>{article.author.username}</Link>
        <time className="date" dateTime={article.createdAt}>{dateFormat.format(new Date(article.createdAt))}</time>
      </div>
    </div>
    <Link className="preview-link" to={`/article/${encodeURIComponent(article.slug)}`}>
      <h1>{article.title}</h1><p>{article.description}</p>
      <span>Read more…</span>
      <ul className="tag-list">{article.tagList.map(tag =>
        <li className="tag-default tag-pill tag-outline" key={tag}>{tag}</li>)}</ul>
    </Link>
  </div>
}

function Pagination({ page, total }: { page: number; total: number }) {
  const { pathname } = useLocation()
  const [search] = useSearchParams()
  const last = Math.ceil(total / pageSize)
  if (last < 2) return null

  function href(number: number) {
    const params = new URLSearchParams(search)
    if (number > 1) params.set('page', String(number))
    else params.delete('page')
    return pathname + (params.size ? `?${params}` : '')
  }

  // Keep both ends reachable without drawing thousands of links for a large global feed.
  const pages = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, last])]
    .filter(number => number >= 1 && number <= last).sort((a, b) => a - b)
  return <nav aria-label="Article pages"><ul className="pagination">
    {pages.flatMap((number, index) => {
      const link = <li key={number} className={`page-item${number === page ? ' active' : ''}`}>
        <Link className="page-link" aria-current={number === page ? 'page' : undefined} to={href(number)}>{number}</Link>
      </li>
      return index && number > pages[index - 1] + 1
        ? [<li className="page-item disabled" key={`gap-${number}`}><span className="page-link">…</span></li>, link]
        : [link]
    })}
  </ul></nav>
}

export function ArticleList({ filter }: { filter: ArticleFilter }) {
  const { user, token } = useSession()
  const [search] = useSearchParams()
  const page = pageNumber(search.get('page'))
  const articles = useQuery({
    queryKey: ['articles', user?.username ?? null, filter, page],
    queryFn: ({ signal }) => api<ArticleListResponse>(articlesPath(filter, page), { signal, token: user ? token : null }),
    enabled: filter.kind !== 'following' || !!user,
  })
  if (articles.isPending) return <p role="status">Loading articles…</p>
  if (articles.isError) return <p role="alert">Unable to load articles. <button onClick={() => void articles.refetch()}>Retry</button></p>
  const { articles: items, articlesCount } = articles.data
  return <>
    {items.map(article => <ArticlePreview key={article.slug} article={article} />)}
    {items.length === 0 && <div className="empty-feed-message">
      {filter.kind === 'following' && articlesCount === 0
        ? <>Your feed is empty. Find authors in the <Link to="/">Global Feed</Link>.</>
        : 'No articles here yet.'}
    </div>}
    <Pagination page={page} total={articlesCount} />
  </>
}
