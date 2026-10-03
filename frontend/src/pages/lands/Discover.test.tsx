import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import type { AIRecommendations, Recommendation } from '@/api/types'
import { fixtureCrop, fixtureLand } from '@/test/fixtures'
import { server } from '@/test/server'
import Discover from './Discover'

// All data below is synthetic test data, not agronomic advice.
const baseAI: AIRecommendations = {
  kind: 'ai_generated',
  status: 'ok',
  reason: null,
  land: { id: fixtureLand.id, name: fixtureLand.name },
  sowing_date: '2026-10-05',
  irrigation: 'assured',
  summary: 'Synthetic summary for a clay field.',
  recommendations: [
    {
      crop: fixtureCrop,
      rank: 1,
      fit: 'strong',
      varieties: [],
      why: ['Soil has 45 % clay (synthetic).'],
      risks: ['Drains slowly after heavy rain (synthetic).'],
      sowing_window: '01 Oct – 31 Oct',
      water_plan: 'Keep shallow standing water (synthetic).',
      confidence: 'high',
    },
  ],
  inputs: [
    { key: 'location', label: 'Location', value: 'Synthetic village, Thanjavur · 0.98 ha', provenance: null },
    { key: 'soil', label: 'Soil', value: 'clay · clay 45 % (SoilGrids 250 m model, 0–30 cm)', provenance: null },
  ],
  data_gaps: ['No lab soil test for this field.'],
  model: 'fake-gemini',
  generated_at: '2026-10-02T10:00:00Z',
  cached: false,
  dropped_claims: 0,
  disclaimer: 'x',
}

const ruleRec: Recommendation = {
  crop: fixtureCrop,
  score: 82,
  score_raw: 81.6,
  suitability: 'suitable',
  confidence: 'preliminary',
  season: null,
  sowing_window: null,
  reasons: ['Rule reason with ~700 mm typical rain.'],
  risks: [],
  limitations: [],
  inputs_used: {},
  unassessed: ['soil'],
}

function mock(ai: Partial<AIRecommendations> | 'error') {
  server.use(
    http.get('*/api/v1/lands/:id', () => HttpResponse.json(fixtureLand)),
    http.get('*/api/v1/lands/:id/recommendations', () => HttpResponse.json([ruleRec])),
    http.get('*/api/v1/lands/:id/recommendations/ai', () =>
      ai === 'error' ? HttpResponse.json({ detail: 'boom' }, { status: 500 }) : HttpResponse.json({ ...baseAI, ...ai }),
    ),
  )
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/app/lands/:landId/discover', element: <Discover /> }], {
    initialEntries: [`/app/lands/${fixtureLand.id}/discover`],
  })
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('Crops for this field', () => {
  it('shows field-specific AI recommendations with the data they used', async () => {
    mock({})
    setup()
    expect(await screen.findByText('Soil has 45 % clay (synthetic).')).toBeInTheDocument()
    expect(screen.getByText('Strong fit')).toBeInTheDocument()
    expect(screen.getByText('Data used for this field')).toBeInTheDocument()
    expect(screen.getByText(/clay 45 % \(SoilGrids 250 m model/)).toBeInTheDocument()
    expect(screen.getByText(/Verify with your local agriculture officer/)).toBeInTheDocument()
    // The transparent rule list is still shown below, and says what it could not assess.
    expect(await screen.findByText('Rule-based suitability')).toBeInTheDocument()
    expect(await screen.findByText(/Not assessed: soil/)).toBeInTheDocument()
  })

  it('says AI is unavailable instead of inventing recommendations', async () => {
    mock({ status: 'unavailable', reason: 'AI recommendations are not configured on this server.', recommendations: [], summary: null })
    setup()
    expect(await screen.findByText('AI recommendations are unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Strong fit')).not.toBeInTheDocument()
    expect(screen.getByText(/We won't show guessed crops/)).toBeInTheDocument()
    expect(await screen.findByText('Rule-based suitability')).toBeInTheDocument()
  })

  it('lists what data is missing when the field has too little data', async () => {
    mock({
      status: 'insufficient_data',
      reason: 'Key data for this field is missing.',
      missing: ['No soil data for this field.'],
      recommendations: [],
      summary: null,
    })
    setup()
    expect(await screen.findByText('Not enough data for this field')).toBeInTheDocument()
    expect(screen.getByText('No soil data for this field.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a soil test' })).toBeInTheDocument()
    expect(screen.queryByText('Strong fit')).not.toBeInTheDocument()
  })

  it('shows an unavailable state with retry when the AI request fails', async () => {
    mock('error')
    setup()
    expect(await screen.findByText('AI recommendations are unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument()
  })
})
