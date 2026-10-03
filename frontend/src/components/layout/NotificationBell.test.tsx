import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { fixtureNotifications } from '@/test/fixtures'
import { NotificationBell } from './NotificationBell'

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const marked: string[] = []
  server.use(
    http.get('*/api/v1/notifications', () => HttpResponse.json(fixtureNotifications)),
    http.post('*/api/v1/notifications/:id/read', ({ params }) => {
      marked.push(String(params.id))
      return HttpResponse.json({})
    }),
  )
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <div data-testid="sidebar" style={{ overflow: 'hidden', width: 248 }}>
          <NotificationBell />
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { marked }
}

describe('NotificationBell', () => {
  it('renders the panel in a portal outside the sidebar', async () => {
    setup()
    const bell = await screen.findByRole('button', { name: 'Notifications (1 unread)' })
    await userEvent.click(bell)
    const panel = await screen.findByRole('dialog', { name: 'Notifications' })
    expect(within(screen.getByTestId('sidebar')).queryByRole('dialog')).toBeNull()
    expect(panel.closest('[data-radix-popper-content-wrapper]')?.parentElement).toBe(document.body)
    expect(within(panel).getByText('Fixture plot: Scout for stem borer')).toBeInTheDocument()
  })

  it('marks unread notifications read and closes with Escape', async () => {
    const { marked } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications (1 unread)' }))
    const panel = await screen.findByRole('dialog', { name: 'Notifications' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(marked).toEqual(['n1']))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument())
  })
})
