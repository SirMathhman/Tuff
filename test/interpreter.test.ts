import { describe, it, expect } from 'vitest'
import { interpret } from '../src/interpreter'

describe('interpret', () => {
  it('parses integer string to number', () => {
    expect(interpret('100')).toBe(100)
  })
})
