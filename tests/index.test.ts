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

describe('execute', () => {
  it('should execute "100" and return 100', () => {
    expect(execute('100')).toBe(100);
  });
});
