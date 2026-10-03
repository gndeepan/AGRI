import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { fixtureCrop, fixtureCycle } from '@/test/fixtures'
import { PlanActionsMenu } from './PlanActions'

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/app/plans/:id', element: <PlanActionsMenu cycle={fixtureCycle} afterDeletePath="/app/plans" /> },
      { path: '/app/plans', element: <div>plans-list</div> },
    ],
    { initialEntries: [`/app/plans/${fixtureCycle.id}`] },
  )
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { qc }
}

async function openMenuItem(name: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Plan actions' }))
  await userEvent.click(await screen.findByRole('button', { name }))
}

describe('PlanActionsMenu', () => {
  it('blocks a nursery date on or after transplanting (synthetic plan)', async () => {
    server.use(http.get('*/api/v1/crops', () => HttpResponse.json([fixtureCrop])))
    let patched = false
    server.use(http.patch('*/api/v1/cycles/:id', () => { patched = true; return HttpResponse.json(fixtureCycle) }))
    setup()
    await openMenuItem('Edit plan')
    const dialog = await screen.findByRole('dialog')
    const nursery = within(dialog).getByLabelText('Nursery sowing date')
    await userEvent.clear(nursery)
    await userEvent.type(nursery, '2026-08-15')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await within(dialog).findByText('Nursery sowing must be before transplanting')).toBeInTheDocument()
    expect(patched).toBe(false)
  })

  it('sends only the edited plan fields and closes on success', async () => {
    server.use(http.get('*/api/v1/crops', () => HttpResponse.json([fixtureCrop])))
    let body: Record<string, unknown> | null = null
    server.use(
      http.patch('*/api/v1/cycles/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...fixtureCycle, notes: body.notes })
      }),
    )
    setup()
    await openMenuItem('Edit plan')
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Notes'), 'Shifted after rain')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(body).toMatchObject({ notes: 'Shifted after rain', anchor_date: '2026-08-10', method: 'transplanting', variety_id: null })
    expect(body).not.toHaveProperty('land_id')
    expect(body).not.toHaveProperty('crop_slug')
  })

  it('deletes after confirmation and leaves the deleted plan page', async () => {
    let deleted = false
    server.use(http.delete('*/api/v1/cycles/:id', () => { deleted = true; return new HttpResponse(null, { status: 204 }) }))
    setup()
    await openMenuItem('Delete plan')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/Your records .* are kept/)).toBeInTheDocument()
    expect(deleted).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete plan' }))
    expect(await screen.findByText('plans-list')).toBeInTheDocument()
    expect(deleted).toBe(true)
  })
})
