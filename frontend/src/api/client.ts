export const API_BASE = '/api/v1'

export class ApiError extends Error {
  status: number
  code?: string
  detail: unknown
  constructor(status: number, message: string, code?: string, detail?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.detail = detail
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: Body
  signal?: AbortSignal
  /** internal: skip the refresh-and-retry dance */
  noRefresh?: boolean
}

let refreshing: Promise<boolean> | null = null
let onAuthLost: (() => void) | null = null

export function setAuthLostHandler(fn: () => void) {
  onAuthLost = fn
}

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'bhoomi' },
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0)
    })
  return refreshing
}

function messageFromDetail(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string } | undefined
    if (first?.msg) return first.msg
  }
  return fallback
}

export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, signal, noRefresh } = opts
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (method !== 'GET') headers['X-Requested-With'] = 'bhoomi'
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload, credentials: 'include', signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'network_error', 'network_error')
  }

  if (res.status === 401 && !noRefresh && !path.startsWith('/auth/')) {
    const ok = await refreshSession()
    if (ok) return api<T>(path, { ...opts, noRefresh: true })
    onAuthLost?.()
  }

  if (!res.ok) {
    let data: { detail?: unknown; code?: string } = {}
    try {
      data = await res.json()
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, messageFromDetail(data.detail, res.statusText || 'request_failed'), data.code, data.detail)
  }
  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('json')) return (await res.text()) as T
  return (await res.json()) as T
}

export function qs(params: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}
