import { interpret } from '../src/interpret';

describe('interpret', () => {
  it('should interpret "100" as 100', () => {
    const result = interpret('100');
    expect(result.type).toBe('ok');
    if (result.type === 'ok') {
      expect(result.value).toBe(100);
    }
  });

  it('should interpret "100U8" as 100', () => {
    const result = interpret('100U8');
    expect(result.type).toBe('ok');
    if (result.type === 'ok') {
      expect(result.value).toBe(100);
    }
  });

  it('should return Err for "-100U8"', () => {
    const result = interpret('-100U8');
    expect(result.type).toBe('err');
    if (result.type === 'err') {
      expect(result.error).toContain('Negative');
    }
  });

  it('should return Err for "256U8"', () => {
    const result = interpret('256U8');
    expect(result.type).toBe('err');
    if (result.type === 'err') {
      expect(result.error).toContain('out of range');
    }
  });
});
