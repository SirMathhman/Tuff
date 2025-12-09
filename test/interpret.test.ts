import { describe, expect, it } from 'bun:test';
import { interpret } from '../src/interpret';

describe('interpret', () => {
  it('always returns an error string', () => {
    const r = interpret('hello');
    expect(r).toMatch(/^Error:/);
  });
});
