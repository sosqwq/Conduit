import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useSession } from '../auth/session'
import { ArticleList, type ArticleFilter } from '../components/ArticleList'
import { api } from '../lib/api'
import { tagFromLocation, tagHref } from '../lib/tagRoute'
import './home-skins.css'

function FeedTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return <li className="nav-item"><Link to={href} className={`nav-link${active ? ' active' : ''}`}
    aria-current={active ? 'page' : undefined}>{label}</Link></li>
}

function PopularTags() {
  const tags = useQuery({
    queryKey: ['tags'],
    queryFn: ({ signal }) => api<{ tags: string[] }>('/tags', { signal }),
  })
  return <aside className="sidebar journal-topics" aria-label="Popular tags">
    <h2>Popular Tags</h2>
    {tags.isPending && <span role="status">Loading tags…</span>}
    {tags.isError && <div role="alert">Unable to load tags. <button className="journal-retry" onClick={() => void tags.refetch()}>Retry</button></div>}
    {tags.data && <div className="tag-list">{tags.data.tags.length
      ? tags.data.tags.map(tag => <Link key={tag} to={tagHref(tag)} className="tag-pill tag-default">{tag}</Link>)
      : <p>Tags will appear here as articles are published.</p>}</div>}
  </aside>
}

export function TagPage() {
  const { pathname, search } = useLocation()
  const tag = tagFromLocation(pathname, search)
  return tag ? <HomePage tag={tag} /> : <Navigate replace to="/" />
}

export function HomePage({ tag }: { tag?: string }) {
  const { user } = useSession()
  const [search] = useSearchParams()
  let filter: ArticleFilter = { kind: 'global' }
  if (tag) filter = { kind: 'tag', value: tag }
  else if (search.get('feed') === 'following') filter = { kind: 'following' }

  return <div className="home-page">
    <div className="banner journal-cover">
      <div className="journal-atmosphere" aria-hidden="true" />
      <div className="container journal-cover-content">
        <div><h1 className="logo-font">conduit</h1><p>A place to share your knowledge.</p></div>
        <a className="journal-jump" href="#article-feed">Browse articles<span aria-hidden="true" /></a>
      </div>
    </div>
    <div className="container page journal-page"><div className="journal-columns">
      <section id="article-feed" className="journal-feed" tabIndex={-1} aria-label="Article feed">
        <header className="journal-feed-heading">
          <h2>Articles</h2>
          <div className="feed-toggle"><ul className="nav nav-pills outline-active">
            {user && <FeedTab href="/?feed=following" label="Your Feed" active={filter.kind === 'following'} />}
            <FeedTab href="/" label="Global Feed" active={filter.kind === 'global'} />
            {tag && <FeedTab href={tagHref(tag)} label={`# ${tag}`} active />}
          </ul></div>
        </header>
        <ArticleList filter={filter} />
      </section>
      <PopularTags />
    </div></div>
  </div>
}
