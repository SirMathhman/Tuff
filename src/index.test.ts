import { describe, it, expect } from 'vitest';
import { interpret } from './index';

describe('interpret', () => {
  it('should return a number', () => {
    expect(typeof interpret('123')).toBe('number');
  });
});
