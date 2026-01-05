import { describe, it, expect } from 'vitest'
import { interpret } from './interpret'

describe('interpret', () => {
  it('throws not implemented error', () => {
    expect(() => interpret('something')).toThrow('interpret: not implemented')
  })
})
