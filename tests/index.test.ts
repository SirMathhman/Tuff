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
function expectExecuteValid(source: string, expected: number): void {
  expect(execute(source)).toBe(expected);
}

function expectExecuteInvalid(source: string): void {
  expect(() => execute(source)).toThrow();
}

describe('execute', () => {
  it('should execute "100" and return 100', () => {
    expectExecuteValid('100', 100);
  });

  it('should execute "100U8" and return 100', () => {
    expectExecuteValid('100U8', 100);
  });

  it('should throw an error when executing "-100U8"', () => {
    expectExecuteInvalid('-100U8');
  });

  it('should throw an error when executing "256U8"', () => {
    expectExecuteInvalid('256U8');
  });
});
