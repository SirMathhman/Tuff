import { describe, it, expect } from 'vitest';
import { interpret } from './index';

describe('interpret', () => {
  it('should return a number', () => {
    expect(typeof interpret('123')).toBe('number');
  });

  it('should interpret "100" as 100', () => {
    expect(interpret('100')).toBe(100);
  });
});
