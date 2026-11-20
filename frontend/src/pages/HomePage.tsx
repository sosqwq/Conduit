import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useSession } from '../auth/session'
import { api } from '../lib/api'
import { avatar } from '../lib/avatar'
import type { ArticleList } from '../lib/types'

export function HomePage() {
  const { status, user, token } = useSession()
  const viewer = status === 'authenticated' ? token : null
  const articles = useQuery({
    queryKey: ['articles', 'global', user?.username ?? null],
    queryFn: ({ signal }) => api<ArticleList>('/articles?limit=10&offset=0', { token: viewer, signal }),
  })
  return <div className="home-page">
    <div className="banner"><div className="container">
      <h1 className="logo-font">conduit</h1>
      <p>A place to share your knowledge.</p>
    </div></div>
    <div className="container page">
      <div className="feed-toggle"><ul className="nav nav-pills outline-active">
        <li className="nav-item"><Link className="nav-link active" to="/">Global Feed</Link></li>
      </ul></div>
      {articles.isPending && <p role="status">Loading articles…</p>}
      {articles.isError && <p role="alert">Unable to load articles. <button onClick={() => void articles.refetch()}>Retry</button></p>}
      {articles.data?.articles.length === 0 && <div className="empty-feed-message">No articles here yet.</div>}
      {articles.data?.articles.map(article => <div className="article-preview" key={article.slug}>
        <div className="article-meta">
          <Link to={`/profile/${encodeURIComponent(article.author.username)}`}>
            <img alt="" src={avatar(article.author.image)} />
          </Link>
          <div className="info">
            <Link className="author" to={`/profile/${encodeURIComponent(article.author.username)}`}>{article.author.username}</Link>
            <time className="date" dateTime={article.createdAt}>{new Date(article.createdAt).toLocaleDateString()}</time>
          </div>
        </div>
        <Link className="preview-link" to={`/article/${encodeURIComponent(article.slug)}`}>
          <h1>{article.title}</h1><p>{article.description}</p>
        </Link>
      </div>)}
    </div>
  </div>
}
