import { interpret } from '../src/interpret';

describe('interpret', () => {
  it('should interpret "100" as 100', () => {
    expect(interpret('100')).toBe(100);
  });
});
