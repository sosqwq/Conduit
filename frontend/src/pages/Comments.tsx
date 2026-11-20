import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/session'
import { RequestErrors } from '../components/RequestErrors'
import { api } from '../lib/api'
import { avatar } from '../lib/avatar'
import type { Comment } from '../lib/types'

export function Comments({ slug }: { slug: string }) {
  const { status, user, token } = useSession()
  const client = useQueryClient()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const key = ['comments', slug, user?.username ?? null] as const
  const path = `/articles/${encodeURIComponent(slug)}/comments`
  const comments = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => (await api<{ comments: Comment[] }>(path, { signal, token: user ? token : null })).comments,
  })
  const post = useMutation({
    mutationFn: (body: string) => api<{ comment: Comment }>(path, { method: 'POST', body: { comment: { body } }, token }),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`${path}/${id}`, { method: 'DELETE', token }),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !draft.trim() || post.isPending) return
    post.mutate(draft, { onSuccess: async ({ comment }) => {
      await client.cancelQueries({ queryKey: key, exact: true })
      client.setQueryData<Comment[]>(key, previous => [comment, ...(previous ?? []).filter(item => item.id !== comment.id)])
      setDraft('')
    } })
  }

  function deleteComment(id: number) {
    remove.mutate(id, { onSuccess: async () => {
      await client.cancelQueries({ queryKey: key, exact: true })
      client.setQueryData<Comment[]>(key, previous => previous?.filter(item => item.id !== id))
    } })
  }

  return <section className="row" aria-label="Comments"><div className="col-xs-12">
    {status === 'authenticated' && user
      ? <form className="card comment-form" onSubmit={submit}>
        <div className="card-block"><textarea className="form-control" rows={3} aria-label="Comment"
          placeholder="Write a comment..." value={draft} disabled={post.isPending}
          onChange={event => setDraft(event.target.value)} /></div>
        <div className="card-footer">
          <img className="comment-author-img" src={avatar(user.image)} alt="" />
          <button className="btn btn-sm btn-primary" disabled={!draft.trim() || !comments.data || post.isPending}>Post Comment</button>
        </div>
      </form>
      : status === 'unauthenticated' && <p><button className="btn btn-sm btn-outline-primary" onClick={() => navigate('/login')}>Sign in</button> to post a comment.</p>}
    <RequestErrors error={post.error} />
    <RequestErrors error={remove.error} />
    {comments.isPending && <p role="status">Loading comments…</p>}
    {comments.isError && <><RequestErrors error={comments.error} /><button onClick={() => void comments.refetch()}>Retry comments</button></>}
    {comments.data?.map(comment => {
      const profile = `/profile/${encodeURIComponent(comment.author.username)}`
      return <div className="card" key={comment.id}>
        <div className="card-block"><p className="card-text">{comment.body}</p></div>
        <div className="card-footer">
          <Link className="comment-author" to={profile}>
            <img className="comment-author-img" src={avatar(comment.author.image)} alt="" /> {comment.author.username}
          </Link>
          <time className="date-posted" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString()}</time>
          {user?.username === comment.author.username && <span className="mod-options">
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Delete comment"
              disabled={remove.isPending} onClick={() => deleteComment(comment.id)}>
              <i className="ion-trash-a" aria-hidden="true">Delete</i>
            </button>
          </span>}
        </div>
      </div>
    })}
  </div></section>
}
