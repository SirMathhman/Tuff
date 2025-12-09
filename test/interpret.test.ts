import { it, expect } from 'bun:test'
import { interpret } from '../src/interpret'

it('interpret returns integer strings unchanged', () => {
  expect(interpret('100')).toBe('100')
})

it('interpret trims and returns integer strings', () => {
  expect(interpret('  -42  ')).toBe('-42')
})

it('interpret throws for non-integer strings', () => {
  expect(() => interpret('hello')).toThrow()
})
