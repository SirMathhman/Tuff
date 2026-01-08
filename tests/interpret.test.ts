import { describe, it, expect } from 'vitest'
import { interpret } from '../src/interpret'

describe('interpret (stub)', () => {
  it('returns a number for any input', () => {
    const result = interpret('anything')
    expect(typeof result).toBe('number')
  })

  it('returns 0 as the current stubbed value', () => {
    expect(interpret('')).toBe(0)
    expect(interpret('42')).toBe(0)
    expect(interpret('hello world')).toBe(0)
  })
})
