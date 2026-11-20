import { afterEach, expect, it, vi } from 'vitest'
import { api, ApiError, errorMessages } from './api'

afterEach(() => vi.unstubAllGlobals())

it('sends JSON using the RealWorld authorization scheme and accepts an empty 200', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(api('/articles/an-article', { method: 'DELETE', token: 'abc' })).resolves.toBeUndefined()
  expect(fetchMock).toHaveBeenCalledWith('/api/articles/an-article', expect.objectContaining({
    method: 'DELETE',
    headers: expect.objectContaining({ Authorization: 'Token abc' }),
  }))
})

it('preserves the status and field errors from a rejected write', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
    errors: { title: ["can't be blank"], email: ['is invalid'] },
  }, { status: 422 })))
  const failure = await api('/articles', { method: 'POST', body: { article: {} } }).catch(e => e)
  expect(failure).toBeInstanceOf(ApiError)
  if (!(failure instanceof ApiError)) throw failure
  expect(failure.status).toBe(422)
  expect(errorMessages(failure)).toEqual(["title can't be blank", 'email is invalid'])
})

it('renders useful text for offline requests', () => {
  expect(errorMessages(new TypeError('Failed to fetch')).join(' ')).toContain('Unable to connect')
})
