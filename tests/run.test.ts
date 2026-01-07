import { run } from '../src/run';

describe('run', () => {
  test('returns length of a non-empty string', () => {
    expect(run('abc')).toBe(3);
  });

  test('returns 0 for empty string', () => {
    expect(run('')).toBe(0);
  });

  test('handles unicode characters', () => {
    // length counts UTF-16 code units; we assert behavior rather than normalize
    expect(run('💡')).toBe(2);
    expect(run('hello💡')).toBe(7);
  });
});
