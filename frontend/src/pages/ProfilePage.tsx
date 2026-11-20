import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, useParams } from 'react-router-dom'
import { useSession } from '../auth/session'
import { ArticleList } from '../components/ArticleList'
import { FollowButton } from '../components/SocialButtons'
import { api, ApiError } from '../lib/api'
import { avatar } from '../lib/avatar'
import type { Profile } from '../lib/types'

export function ProfilePage({ favorites = false }: { favorites?: boolean }) {
  const username = useParams().username ?? ''
  const { user, status, token } = useSession()
  const profile = useQuery({
    queryKey: ['profile', username, user?.username ?? null],
    queryFn: ({ signal }) => api<{ profile: Profile }>(`/profiles/${encodeURIComponent(username)}`, {
      signal, token: user ? token : null,
    }),
    enabled: status !== 'loading',
  })
  if (profile.isPending) return <section className="profile-page container page"><p role="status">Loading profile…</p></section>
  if (profile.isError) {
    const missing = profile.error instanceof ApiError && profile.error.status === 404
    return <section className="profile-page container page">
      <p role="alert">{missing ? 'Profile not found.' : 'Unable to load this profile.'}</p>
      <button type="button" className="btn btn-outline-secondary" onClick={() => void profile.refetch()}>Retry</button>
    </section>
  }
  const person = profile.data.profile
  const own = user?.username === person.username
  const path = `/profile/${encodeURIComponent(person.username)}`
  return <div className="profile-page">
    <div className="user-info"><div className="container">
      <img alt="" className="user-img" src={avatar(person.image)} />
      <h4>{person.username}</h4>
      <p>{person.bio ?? ''}</p>
      {own
        ? <Link to="/settings" className="btn btn-sm btn-outline-secondary action-btn">Edit Profile Settings</Link>
        : <FollowButton profile={person} />}
    </div></div>
    <div className="container page"><div className="row"><section className="col-xs-12 col-md-10 offset-md-1" aria-label="Profile articles">
      <nav className="articles-toggle" aria-label="Profile feeds"><ul className="nav nav-pills outline-active">
        <li className="nav-item"><NavLink end className="nav-link" to={path}>{own ? 'My Articles' : 'Articles'}</NavLink></li>
        <li className="nav-item"><NavLink end className="nav-link" to={`${path}/favorites`}>Favorited Articles</NavLink></li>
      </ul></nav>
      <ArticleList filter={{ kind: favorites ? 'favorited' : 'author', value: person.username }} />
    </section></div></div>
  </div>
}
