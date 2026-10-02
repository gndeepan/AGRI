import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CropImage } from './CropImage'

// Synthetic crop fixture; the image URL intentionally points nowhere.
const crop = {
  slug: 'paddy',
  category: 'cereal',
  image_url: '/images/crops/does-not-exist.jpg',
  image_credit: { author: 'Test Author', license: 'CC BY 4.0', source_url: 'https://example.org/file', title: 'x' },
}

describe('CropImage', () => {
  it('falls back to a category illustration when the photo fails to load', () => {
    const { container } = render(<TooltipProvider><CropImage crop={crop} showCredit /></TooltipProvider>)
    expect(screen.getByRole('link', { name: /Test Author · CC BY 4.0/ })).toHaveAttribute('href', 'https://example.org/file')
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByTestId('crop-fallback')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('uses the illustration when there is no photo at all', () => {
    render(<CropImage crop={{ ...crop, image_url: null, image_credit: null }} />)
    expect(screen.getByTestId('crop-fallback')).toBeInTheDocument()
  })
})
