import { bboxCenter, spinStart, unionBbox } from './camera'

describe('globe camera helpers', () => {
  it('unions field bounding boxes', () => {
    expect(unionBbox([[79, 10, 79.1, 10.1], [78.5, 10.05, 79.05, 10.4]])).toEqual([78.5, 10, 79.1, 10.4])
    expect(unionBbox([])).toBeNull()
  })

  it('centres a bbox', () => {
    expect(bboxCenter([79, 10, 80, 11])).toEqual([79.5, 10.5])
  })

  it('starts the spin west of the target with a clamped latitude', () => {
    expect(spinStart([79, 10])).toEqual([9, 6])
    expect(spinStart([0, 70])[1]).toBe(30)
  })
})
