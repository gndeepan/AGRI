import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { fixtureLand, fixtureMetrics, fixtureUser } from './fixtures'

export const handlers = [
  http.get('*/api/v1/auth/me', () => HttpResponse.json(fixtureUser)),
  http.post('*/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    if (body.password === 'wrong-password') return HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 })
    return HttpResponse.json(fixtureUser)
  }),
  http.post('*/api/v1/geo/measure', () => HttpResponse.json(fixtureMetrics)),
  http.get('*/api/v1/lands', () => HttpResponse.json([fixtureLand])),
]

export const server = setupServer(...handlers)
