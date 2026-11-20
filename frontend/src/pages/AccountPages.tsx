import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/session'
import { api, errorMessages } from '../lib/api'
import type { User } from '../lib/types'

type PageKind = 'login' | 'register' | 'settings'

function Input({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <fieldset className="form-group">
      <input className="form-control form-control-lg" aria-label={label} placeholder={label} {...props} />
    </fieldset>
  )
}

function accountChanges(data: FormData, kind: PageKind, user: User | null) {
  const text = (name: string) => String(data.get(name) ?? '')
  if (kind === 'login') return { email: text('email'), password: text('password') }
  if (kind === 'register') return { username: text('username'), email: text('email'), password: text('password') }

  const changes: Record<string, string | null> = {}
  for (const name of ['username', 'email', 'image', 'bio'] as const) {
    const value = text(name)
    if (value !== (user?.[name] ?? '')) {
      changes[name] = (name === 'bio' || name === 'image') && value === '' ? null : value
    }
  }
  if (text('password')) changes.password = text('password')
  return changes
}

function AccountForm({ kind }: { kind: PageKind }) {
  const { user, token, accept, logout } = useSession()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const request = useRef<AbortController | null>(null)
  const settings = kind === 'settings'
  const registering = kind === 'register'
  const action = settings ? 'Update Settings' : registering ? 'Sign up' : 'Sign in'

  useEffect(() => () => request.current?.abort(), [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (request.current) return
    const body = { user: accountChanges(new FormData(event.currentTarget), kind, user) }
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setErrors([])
    try {
      const path = settings ? '/user' : registering ? '/users' : '/users/login'
      const result = await api<{ user: User }>(path, {
        method: settings ? 'PUT' : 'POST',
        body,
        token: settings ? token ?? undefined : undefined,
        signal: controller.signal,
      })
      if (!controller.signal.aborted) {
        accept(result.user)
        navigate(settings ? `/profile/${encodeURIComponent(result.user.username)}` : '/')
      }
    } catch (error) {
      if (!controller.signal.aborted) setErrors(errorMessages(error))
    } finally {
      request.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  if (settings && !user) return null

  return (
    <div className={settings ? 'settings-page' : 'auth-page'}>
      <div className="container page">
        <div className="row">
          <div className="col-md-6 offset-md-3 col-xs-12">
            <h1 className="text-xs-center">{settings ? 'Your Settings' : action}</h1>
            {!settings && (
              <p className="text-xs-center">
                <Link to={registering ? '/login' : '/register'}>
                  {registering ? 'Have an account?' : 'Need an account?'}
                </Link>
              </p>
            )}
            {errors.length > 0 && (
              <ul className="error-messages" role="alert">
                {errors.map((error, index) => <li key={index}>{error}</li>)}
              </ul>
            )}
            <form onSubmit={submit} aria-busy={pending}>
              <fieldset disabled={pending}>
                {settings && <Input name="image" label="Profile image URL" placeholder="URL of profile picture"
                  type="url" defaultValue={user?.image ?? ''} />}
                {(settings || registering) && <Input name="username" label="Username" autoComplete="username"
                  required defaultValue={settings ? user?.username : ''} />}
                {settings && (
                  <fieldset className="form-group">
                    <textarea name="bio" aria-label="Bio" placeholder="Short bio about you" rows={8}
                      defaultValue={user?.bio ?? ''} className="form-control form-control-lg" />
                  </fieldset>
                )}
                <Input name="email" label="Email" type="email" autoComplete="email"
                  required defaultValue={settings ? user?.email : ''} />
                <Input name="password" label={settings ? 'New Password' : 'Password'} type="password"
                  required={!settings} autoComplete={kind === 'login' ? 'current-password' : 'new-password'} />
                <button type="submit" disabled={pending} className="btn btn-lg btn-primary pull-xs-right">
                  {action}
                </button>
              </fieldset>
            </form>
            {settings && (
              <>
                <hr />
                <button type="button" disabled={pending} className="btn btn-outline-danger"
                  onClick={() => { logout(); navigate('/') }}>
                  Or click here to logout
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function LoginPage() { return <AccountForm kind="login" /> }
export function RegisterPage() { return <AccountForm kind="register" /> }
export function SettingsPage() { return <AccountForm kind="settings" /> }
