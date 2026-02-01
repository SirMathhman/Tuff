import { compileTuffToJS } from '../src/index';

/**
 * Execute compiled Tuff code and return the result as a number.
 *
 * @param source - Tuff source code as a string
 * @returns The result of executing the compiled code as a number
 */
export function execute(source: string): number {
  const compiled = compileTuffToJS(source);
  const fn = new Function(compiled);
  return fn();
}

/**
 * Test helper to assert that executing source code returns an expected value.
 *
 * @param source - Tuff source code as a string
 * @param expected - The expected return value
 */
function validate(source: string, expected: number): void {
  expect(execute(source)).toBe(expected);
}

function invalidate(source: string): void {
  expect(() => execute(source)).toThrow();
}

describe('execute', () => {
  it('should execute "100" and return 100', () => {
    validate('100', 100);
  });

  it('should execute "100U8" and return 100', () => {
    validate('100U8', 100);
  });

  it('should throw an error when executing "-100U8"', () => {
    invalidate('-100U8');
  });

  it('should execute "-100I8" and return -100', () => {
    validate('-100I8', -100);
  });

  it('should throw an error when executing "256U8"', () => {
    invalidate('256U8');
  });

  it('should execute "1U8 + 2U8" and return 3', () => {
    validate('1U8 + 2U8', 3);
  });

  it('should throw an error when executing "1U8 + 255U8"', () => {
    invalidate('1U8 + 255U8');
  });

  it('should throw an error when executing "1U8 + 255"', () => {
    invalidate('1U8 + 255');
  });

  it('should execute "1U8 + 2" and return 3', () => {
    validate('1U8 + 2', 3);
  });

  it('should execute "1U8 + 255U16" and return 256', () => {
    validate('1U8 + 255U16', 256);
  });

  it('should throw an error when executing "1U8 + 65535U16"', () => {
    invalidate('1U8 + 65535U16');
  });

  it('should execute "1 + 2 + 3" and return 6', () => {
    validate('1 + 2 + 3', 6);
  });

  it('should execute "2 + 3 - 4" and return 1', () => {
    validate('2 + 3 - 4', 1);
  });

  it('should execute "2 * 3 + 4" and return 10', () => {
    validate('2 * 3 + 4', 10);
  });

  it('should execute "2 + 3 * 4" and return 14', () => {
    validate('2 + 3 * 4', 14);
  });

  it('should execute "(2 + 3) * 4" and return 20', () => {
    validate('(2 + 3) * 4', 20);
  });
});
