import { it, expect } from 'bun:test'
import { interpret } from '../src/interpret'

it('interpret throws not implemented error', () => {
  expect(() => interpret('hello')).toThrow()
})
