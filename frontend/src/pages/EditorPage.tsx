import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../auth/session'
import { api, errorMessages } from '../lib/api'
import { articleKey, articleQuery } from '../lib/articles'
import type { Article } from '../lib/types'

function EditorForm({ initial }: { initial?: Article }) {
  const { user, token } = useSession()
  const client = useQueryClient()
  const navigate = useNavigate()
  const [tags, setTags] = useState<string[]>(initial?.tagList ?? [])
  const [tagInput, setTagInput] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  function addTag(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    const name = tagInput.trim()
    if (name && !tags.includes(name)) setTags([...tags, name])
    setTagInput('')
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (request.current || !user || !token) return
    const data = new FormData(event.currentTarget)
    const article = {
      title: String(data.get('title') ?? ''),
      description: String(data.get('description') ?? ''),
      body: String(data.get('body') ?? ''),
      tagList: tags,
    }
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setErrors([])
    try {
      const path = initial ? `/articles/${encodeURIComponent(initial.slug)}` : '/articles'
      const result = await api<{ article: Article }>(path, {
        method: initial ? 'PUT' : 'POST', body: { article }, token, signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (initial && initial.slug !== result.article.slug) {
        client.removeQueries({ queryKey: ['article', initial.slug] })
        client.removeQueries({ queryKey: ['comments', initial.slug] })
      }
      void client.invalidateQueries({ queryKey: ['article', result.article.slug], refetchType: 'none' })
      client.setQueryData(articleKey(result.article.slug, user.username), result.article)
      void client.invalidateQueries({ queryKey: ['articles'] })
      void client.invalidateQueries({ queryKey: ['tags'] })
      navigate(`/article/${encodeURIComponent(result.article.slug)}`)
    } catch (error) {
      if (!controller.signal.aborted) setErrors(errorMessages(error))
    } finally {
      request.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  return <form onSubmit={publish} aria-busy={pending}>
    {errors.length > 0 && <ul className="error-messages" role="alert">
      {errors.map((error, index) => <li key={index}>{error}</li>)}
    </ul>}
    <fieldset disabled={pending}>
      <fieldset className="form-group">
        <input name="title" aria-label="Article title" placeholder="Article Title" className="form-control form-control-lg"
          defaultValue={initial?.title ?? ''} />
      </fieldset>
      <fieldset className="form-group">
        <input name="description" aria-label="Description" placeholder="What's this article about?" className="form-control"
          defaultValue={initial?.description ?? ''} />
      </fieldset>
      <fieldset className="form-group">
        <textarea name="body" aria-label="Article body" placeholder="Write your article (in markdown)" className="form-control"
          rows={10} defaultValue={initial?.body ?? ''} />
      </fieldset>
      <fieldset className="form-group">
        <input name="tag" aria-label="Tags (press Enter to add)" placeholder="Enter tags" className="form-control"
          value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={addTag} />
        <div className="tag-list">
          {tags.map(tag => <span className="tag-default tag-pill" key={tag}>
            <button type="button" aria-label={`Remove ${tag}`}
              style={{ background: 'transparent', border: 0, color: 'inherit', padding: '0 0.3em 0 0' }}
              onClick={() => setTags(tags.filter(item => item !== tag))}>
              <i aria-hidden="true">×</i>
            </button>{tag}
          </span>)}
        </div>
      </fieldset>
      <button type="submit" disabled={pending} className="btn btn-lg pull-xs-right btn-primary">Publish Article</button>
    </fieldset>
  </form>
}

function EditExisting({ slug }: { slug: string }) {
  const { user, token } = useSession()
  const article = useQuery(articleQuery(slug, user?.username ?? null, token))
  if (article.isPending) return <p role="status">Loading article…</p>
  if (!article.data) return <>
    <ul className="error-messages" role="alert">{errorMessages(article.error).map((error, index) => <li key={index}>{error}</li>)}</ul>
    <button type="button" className="btn btn-outline-secondary" onClick={() => void article.refetch()}>Retry</button>
  </>
  if (article.data.author.username !== user?.username) return <p role="alert">Only the author can edit this article.</p>
  return <EditorForm initial={article.data} />
}

export function EditorPage() {
  const { slug } = useParams()
  return <div className="editor-page"><div className="container page"><div className="row">
    <div className="col-md-10 offset-md-1 col-xs-12">
      <h1>{slug ? 'Edit Article' : 'New Article'}</h1>
      {slug ? <EditExisting key={slug} slug={slug} /> : <EditorForm />}
    </div>
  </div></div></div>
}
