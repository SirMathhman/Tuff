import { interpret } from '../src/interpret';

describe('interpret', () => {
  test('returns a finite number for any string input', () => {
    const a = interpret('');
    expect(typeof a).toBe('number');
    expect(Number.isFinite(a)).toBe(true);

    const b = interpret('some input');
    expect(typeof b).toBe('number');
    expect(Number.isFinite(b)).toBe(true);
  });
});
