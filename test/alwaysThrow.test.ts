import { describe, it, expect } from 'bun:test'
import { alwaysThrow } from '../src/alwaysThrow'

describe('alwaysThrow', () => {
  it('always throws an Error when called', () => {
    expect(() => alwaysThrow()).toThrow(Error)
  })
})
