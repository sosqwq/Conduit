import { lazy, Suspense, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSession } from './auth/session'
import { api } from './lib/api'
import { avatar } from './lib/avatar'
import type { Profile } from './lib/types'
import { LoginPage, RegisterPage, SettingsPage } from './pages/AccountPages'
import { HomePage } from './pages/HomePage'

const TutorialIndex = lazy(() => import('./tutorial/Tutorial').then(module => ({ default: module.TutorialIndex })))
const TutorialChapter = lazy(() => import('./tutorial/Tutorial').then(module => ({ default: module.TutorialChapter })))

function Navbar() {
  const { status, user, retry } = useSession()
  return <nav className="navbar navbar-light" aria-label="Main navigation"><div className="container">
    <Link className="navbar-brand" to="/">conduit</Link>
    <ul className="nav navbar-nav">
      <li className="nav-item"><NavLink end className="nav-link" to="/">Home</NavLink></li>
      <li className="nav-item"><NavLink className="nav-link" to="/tutorial">教程</NavLink></li>
      {status === 'authenticated' && user && <>
        <li className="nav-item"><NavLink className="nav-link" to="/editor">New Article</NavLink></li>
        <li className="nav-item"><NavLink className="nav-link" to="/settings">Settings</NavLink></li>
        <li className="nav-item"><NavLink className="nav-link" to={`/profile/${encodeURIComponent(user.username)}`}>
          <img className="user-pic" alt="" src={avatar(user.image)} /> {user.username}
        </NavLink></li>
      </>}
      {status === 'unauthenticated' && <>
        <li className="nav-item"><NavLink className="nav-link" to="/login">Sign in</NavLink></li>
        <li className="nav-item"><NavLink className="nav-link" to="/register">Sign up</NavLink></li>
      </>}
      {(status === 'loading' || status === 'unavailable') && <li className="nav-item reconnect">
        <span role="status">Connecting</span>
        {status === 'unavailable' && <button type="button" onClick={retry}>Retry</button>}
      </li>}
    </ul>
  </div></nav>
}

function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useSession()
  if (status === 'unauthenticated') return <Navigate replace to="/login" />
  if (status !== 'authenticated') return <p className="container" role="status">Waiting for your account…</p>
  return children
}

function HomeRoute() {
  const [search] = useSearchParams()
  const page = <HomePage />
  return search.get('feed') === 'following' ? <RequireSession>{page}</RequireSession> : page
}

function ProfileHeader() {
  const username = useParams().username ?? ''
  const { user, token } = useSession()
  const profile = useQuery({
    queryKey: ['profile', username, user?.username ?? null],
    queryFn: ({ signal }) => api<{ profile: Profile }>(`/profiles/${encodeURIComponent(username)}`, { signal, token: user ? token : null }),
  })
  const person = profile.data?.profile
  return <div className="profile-page"><div className="user-info"><div className="container">
    {profile.isPending && <p>Loading profile…</p>}
    {profile.isError && <p role="alert">Unable to load this profile.</p>}
    {person && <>
      <img alt="" className="user-img" src={avatar(person.image)} />
      <h4>{person.username}</h4><p>{person.bio ?? ''}</p>
      {user?.username === person.username && <Link className="btn btn-sm btn-outline-secondary" to="/settings">Edit Profile Settings</Link>}
    </>}
  </div></div></div>
}

export function App() {
  return <>
    <Navbar />
    <main><Suspense fallback={<p className="container" role="status">Loading…</p>}>
      <Routes>
        <Route index element={<HomeRoute />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="settings" element={<RequireSession><SettingsPage /></RequireSession>} />
        <Route path="editor" element={<RequireSession><section className="container page"><h1>New Article</h1></section></RequireSession>} />
        <Route path="profile/:username" element={<ProfileHeader />} />
        <Route path="tutorial" element={<TutorialIndex />} />
        <Route path="tutorial/:chapter" element={<TutorialChapter />} />
        <Route path="*" element={<section className="container page"><h1>Page not found</h1><Link to="/">Home</Link></section>} />
      </Routes>
    </Suspense></main>
    <footer><div className="container"><Link className="logo-font" to="/">conduit</Link></div></footer>
  </>
}
