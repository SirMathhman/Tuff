import { describe, it, expect } from 'bun:test';
import { interpret } from '../src/interpret';

describe('interpret', () => {
  it('parses simple integer string', () => {
    expect(interpret('100')).toBe(100);
  });

  it('parses integer with U8 type suffix', () => {
    expect(interpret('100U8')).toBe(100);
  });

  it('rejects negative numbers with unsigned type suffix', () => {
    expect(() => interpret('-100U8')).toThrow('Invalid number: -100U8');
  });

  it('parses negative integer with signed I8 type suffix', () => {
    expect(interpret('-100I8')).toBe(-100);
  });

  it('rejects value out of range for U8', () => {
    expect(() => interpret('256U8')).toThrow('Invalid number: 256U8');
  });

  it('evaluates simple addition with type suffixes', () => {
    expect(interpret('1U8 + 2U8')).toBe(3);
  });

  it('rejects expression result out of range for U8', () => {
    expect(() => interpret('1U8 + 255U8')).toThrow('Invalid expression: 1U8 + 255U8');
  });
});
