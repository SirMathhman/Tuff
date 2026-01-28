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
    expect(() => interpret('1U8 + 255U8')).toThrow(
      'Invalid expression: 1U8 + 255U8'
    );
  });

  it('allows mixing typed and untyped operands when result fits', () => {
    expect(interpret('1U8 + 254')).toBe(255);
  });

  it('rejects result out of range when mixing typed and untyped operands', () => {
    expect(() => interpret('1U8 + 255')).toThrow(
      'Invalid expression: 1U8 + 255'
    );
  });

  it('rejects expressions with mismatched type suffixes', () => {
    expect(() => interpret('1U8 + 65535U16')).toThrow(
      'Invalid expression: 1U8 + 65535U16'
    );
  });

  it('allows different unsigned type suffixes when result fits widest type', () => {
    expect(interpret('1U8 + 255U16')).toBe(256);
  });

  it('evaluates multiple operands with mixed types and untyped numbers', () => {
    expect(interpret('1U8 + 2 + 3U16')).toBe(6);
  });

  it('evaluates multiple addition and subtraction with signed types', () => {
    expect(interpret('2I8 + 3I8 - 4I8')).toBe(1);
  });

  it('evaluates expression with multiplication and subtraction', () => {
    expect(interpret('2I8 * 3I8 - 4I8')).toBe(2);
  });

  it('respects operator precedence (* before +)', () => {
    expect(interpret('1I8 + 2I8 * 3I8')).toBe(7);
  });

  it('respects operator precedence for untyped numbers', () => {
    expect(interpret('4 + 2 * 3')).toBe(10);
  });

  it('supports parentheses to override precedence', () => {
    expect(interpret('(4 + 2) * 3')).toBe(18);
  });

  it('supports curly braces for grouping', () => {
    expect(interpret('(4 + { 2 }) * 3')).toBe(18);
  });

  it('supports let declarations in block expressions', () => {
    expect(interpret('(4 + { let x : I32 = 2; x }) * 3')).toBe(18);
  });

  it('supports multiple let declarations and variable usage in expressions', () => {
    expect(interpret('{ let x : U8 = 10; let y : U8 = 20; x + y }')).toBe(30);
  });

  it('supports using previously defined variables in new let declarations', () => {
    expect(interpret('(4 + { let x : I32 = 2; let y : I32 = x; y }) * 3')).toBe(
      18
    );
  });
});
