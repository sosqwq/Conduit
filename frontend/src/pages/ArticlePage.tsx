import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../auth/session'
import { RequestErrors } from '../components/RequestErrors'
import { FavoriteButton, FollowButton } from '../components/SocialButtons'
import { api } from '../lib/api'
import { articleQuery } from '../lib/articles'
import { avatar } from '../lib/avatar'
import { Comments } from './Comments'

export function ArticlePage() {
  const { slug = '' } = useParams()
  const { user } = useSession()
  return <ArticleDetail key={JSON.stringify([slug, user?.username])} slug={slug} />
}

function ArticleDetail({ slug }: { slug: string }) {
  const { status, user, token } = useSession()
  const client = useQueryClient()
  const navigate = useNavigate()
  const viewer = user?.username ?? null
  const detail = useQuery({ ...articleQuery(slug, viewer, user ? token : null), enabled: status !== 'loading' })
  const article = detail.data
  const remove = useMutation({ mutationFn: () => api(`/articles/${encodeURIComponent(slug)}`, { method: 'DELETE', token }) })

  function deleteArticle() {
    remove.mutate(undefined, { onSuccess: () => {
      navigate('/', { replace: true })
      client.removeQueries({ queryKey: ['article', slug] })
      client.removeQueries({ queryKey: ['comments', slug] })
      void client.invalidateQueries({ queryKey: ['articles'] })
      void client.invalidateQueries({ queryKey: ['tags'] })
    } })
  }

  return <div className="article-page">
    {!article && <div className="container page">
      {detail.isPending && <p role="status">Loading article…</p>}
      {detail.isError && <><RequestErrors error={detail.error} /><button onClick={() => void detail.refetch()}>Retry</button></>}
    </div>}
    {article && <>
      <div className="banner"><div className="container">
        <h1>{article.title}</h1>
        <div className="article-meta">
          <Link to={`/profile/${encodeURIComponent(article.author.username)}`} aria-label={`Profile of ${article.author.username}`}>
            <img src={avatar(article.author.image)} alt="" />
          </Link>
          <div className="info">
            <Link className="author" to={`/profile/${encodeURIComponent(article.author.username)}`}>{article.author.username}</Link>
            <time className="date" dateTime={article.createdAt}>{new Date(article.createdAt).toLocaleDateString()}</time>
          </div>
          {viewer === article.author.username ? <>
            <Link className="btn btn-sm btn-outline-secondary" to={`/editor/${encodeURIComponent(article.slug)}`}>Edit Article</Link>{' '}
            <button className="btn btn-sm btn-outline-danger" disabled={remove.isPending} onClick={deleteArticle}>Delete Article</button>
          </> : <>
            <FollowButton profile={article.author} />
            <FavoriteButton article={article} />
          </>}
        </div>
      </div></div>
      <div className="container page">
        <RequestErrors error={remove.error} />
        <div className="article-content row"><div className="col-md-12">
          <Markdown remarkPlugins={[remarkGfm]} skipHtml>{article.body}</Markdown>
          <div className="tag-list">{article.tagList.map(tag =>
            <Link key={tag} className="tag-default tag-pill tag-outline" to={`/tag/${encodeURIComponent(tag)}`}>{tag}</Link>)}</div>
        </div></div>
        <hr />
        <Comments slug={slug} />
      </div>
    </>}
  </div>
}
