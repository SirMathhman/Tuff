import { describe, it, expect } from 'bun:test';
import { interpret } from '../src/interpret';

describe('interpret', () => {
  it('parses simple integer string', () => {
    expect(interpret('100')).toBe(100);
  });

  it('parses integer with U8 type suffix', () => {
    expect(interpret('100U8')).toBe(100);
  });

  it('rejects negative numbers with type suffix', () => {
    expect(() => interpret('-100U8')).toThrow('Invalid number: -100U8');
  });
});
