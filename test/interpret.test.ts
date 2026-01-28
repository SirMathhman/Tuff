import { describe, it, expect } from 'vitest'
import { interpret } from '../src/interpret'

describe('interpret', () => {
  it('parses simple integer string', () => {
    expect(interpret('100')).toBe(100)
  })
})
