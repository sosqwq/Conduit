type FieldErrors = Record<string, string[]>

export class ApiError extends Error {
  constructor(readonly status: number, readonly errors: FieldErrors) {
    super(`Request failed (HTTP ${status})`)
  }
}

export function errorMessages(error: unknown): string[] {
  if (error instanceof ApiError) {
    const messages = Object.entries(error.errors)
      .flatMap(([field, values]) => values.map(value => `${field} ${value}`))
    return messages.length ? messages : [error.message]
  }
  if (error instanceof TypeError) return ['Unable to connect. Please try again.']
  return [error instanceof Error ? error.message : 'Something went wrong. Please try again.']
}

interface ApiOptions {
  method?: string
  body?: unknown
  token?: string | null
  signal?: AbortSignal
}

export function api<T = void>(path: string, options?: ApiOptions): Promise<T>
export async function api(path: string, options: ApiOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.token) headers.Authorization = `Token ${options.token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET', headers, signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  if (!response.ok) {
    let errors: FieldErrors = {}
    try {
      const payload = JSON.parse(text)
      if (payload?.errors && typeof payload.errors === 'object') {
        errors = Object.fromEntries(Object.entries(payload.errors).filter((entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].every(item => typeof item === 'string')))
      }
    } catch {
      // A gateway may return HTML; preserve its HTTP status for session recovery.
    }
    throw new ApiError(response.status, errors)
  }
  return text ? JSON.parse(text) : undefined
}
