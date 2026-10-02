import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import Login from './Login'

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/login', element: <Login /> },
      { path: '/app', element: <div>dashboard-page</div> },
    ],
    { initialEntries: ['/login'] },
  )
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('Login', () => {
  it('validates before submitting', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })

  it('shows an error for wrong credentials (synthetic MSW response)', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Email'), 'fixture.farmer@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument()
  })

  it('navigates to the dashboard on success', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Email'), 'fixture.farmer@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'paddyfield42')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('dashboard-page')).toBeInTheDocument()
  })
})
