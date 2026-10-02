import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { fixtureMetrics } from '@/test/fixtures'
import { MetricsPanel } from './MetricsPanel'

describe('MetricsPanel', () => {
  it('shows area in the preferred unit with the alternate unit and m²', () => {
    render(<MetricsPanel metrics={fixtureMetrics} unit="acre" source="server" />)
    expect(screen.getByText('2 ac')).toBeInTheDocument()
    expect(screen.getByText(/0\.81 ha · 8,094 m²/)).toBeInTheDocument()
    expect(screen.getByText('360 m')).toBeInTheDocument()
    expect(screen.getByText(/10\.78700° N, 79\.13800° E/)).toBeInTheDocument()
  })

  it('always shows the legal-boundary disclaimer and source', () => {
    render(<MetricsPanel metrics={fixtureMetrics} unit="hectare" source="preview" />)
    expect(screen.getByText(/not a legal or cadastral survey/i)).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })
})
