import { describe, it, expect } from 'bun:test'
import { alwaysThrow } from '../src/alwaysThrow'

describe('alwaysThrow', () => {
  it('always throws an Error when called with a message', () => {
    expect(() => alwaysThrow('boom')).toThrow(Error)
  })
})
