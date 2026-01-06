import { describe, it, expect } from 'vitest';
import { evalLeftToRight } from '../src/evalLeftToRight';

describe('evalLeftToRight', () => {
  it('evaluates left-to-right', () => {
    const tokens = [
      { type: 'num', value: 10 } as const,
      { type: 'op', value: '-' } as const,
      { type: 'num', value: 5 } as const,
      { type: 'op', value: '+' } as const,
      { type: 'num', value: 3 } as const,
    ];
    expect(evalLeftToRight(tokens as any)).toBe(8);
  });

  it('throws on invalid token sequence', () => {
    expect(() => evalLeftToRight([{ type: 'op', value: '+' } as any])).toThrow('Invalid numeric input');
  });
});
