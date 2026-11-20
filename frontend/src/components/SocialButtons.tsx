import { useSession } from '../auth/session'
import { useFavorite, useFollow } from '../lib/social'
import type { ArticleSummary, Profile } from '../lib/types'

function ActionErrors({ messages }: { messages: string[] }) {
  if (!messages.length) return null
  return <ul className="error-messages" role="alert">
    {messages.map((message, index) => <li key={index}>{message}</li>)}
  </ul>
}

export function FavoriteButton({ article, compact = false }: { article: ArticleSummary; compact?: boolean }) {
  const { active, count, pending, toggle, errors } = useFavorite(article)
  const action = active ? 'Unfavorite' : 'Favorite'
  return <>
    <button type="button" disabled={pending} aria-pressed={active} onClick={toggle}
      aria-label={compact ? `${action} ${article.title} (${count})` : undefined}
      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline-primary'}${compact ? ' pull-xs-right' : ''}`}>
      {compact ? <><span aria-hidden="true">♥</span> {count}</> : <>{action} Article ({count})</>}
    </button>
    <ActionErrors messages={errors} />
  </>
}

export function FollowButton({ profile }: { profile: Profile }) {
  const { user } = useSession()
  const { active, pending, toggle, errors } = useFollow(profile)
  if (user?.username === profile.username) return null
  return <>
    <button type="button" disabled={pending} aria-pressed={active} onClick={toggle}
      className={`btn btn-sm action-btn ${active ? 'btn-secondary' : 'btn-outline-secondary'}`}>
      {active ? 'Unfollow' : 'Follow'} {profile.username}
    </button>
    <ActionErrors messages={errors} />
  </>
}
