import { lazy, Suspense, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useSearchParams } from 'react-router-dom'
import { useSession } from './auth/session'
import { avatar } from './lib/avatar'
import { LoginPage, RegisterPage, SettingsPage } from './pages/AccountPages'
import { HomePage, TagPage } from './pages/HomePage'
import { EditorPage } from './pages/EditorPage'
import { ArticlePage } from './pages/ArticlePage'
import { ProfilePage } from './pages/ProfilePage'

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

export function App() {
  return <>
    <Navbar />
    <main><Suspense fallback={<p className="container" role="status">Loading…</p>}>
      <Routes>
        <Route index element={<HomeRoute />} />
        <Route path="tag/:tag?" element={<TagPage />} />
        <Route path="article/:slug" element={<ArticlePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="settings" element={<RequireSession><SettingsPage /></RequireSession>} />
        <Route path="editor/:slug?" element={<RequireSession><EditorPage /></RequireSession>} />
        <Route path="profile/:username" element={<ProfilePage />} />
        <Route path="profile/:username/favorites" element={<ProfilePage favorites />} />
        <Route path="tutorial" element={<TutorialIndex />} />
        <Route path="tutorial/:chapter" element={<TutorialChapter />} />
        <Route path="*" element={<section className="container page"><h1>Page not found</h1><Link to="/">Home</Link></section>} />
      </Routes>
    </Suspense></main>
    <footer><div className="container"><Link className="logo-font" to="/">conduit</Link></div></footer>
  </>
}
