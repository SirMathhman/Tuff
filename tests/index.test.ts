import { compileTuffToJS } from "../src/index";

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
  expect(() => compileTuffToJS(source)).toThrow();
}

describe("execute", () => {
  it('should execute "100" and return 100', () => {
    validate("100", 100);
  });

  it('should execute "100U8" and return 100', () => {
    validate("100U8", 100);
  });

  it('should reject "-100U8"', () => {
    invalidate("-100U8");
  });

  it('should reject "256U8"', () => {
    invalidate("256U8");
  });

  it('should execute "1000U16" and return 1000', () => {
    validate("1000U16", 1000);
  });

  it('should reject "65536U16"', () => {
    invalidate("65536U16");
  });

  it('should execute "100000U32" and return 100000', () => {
    validate("100000U32", 100000);
  });

  it('should reject "4294967296U32"', () => {
    invalidate("4294967296U32");
  });

  it('should execute "100U64" and return 100', () => {
    validate("100U64", 100);
  });

  it('should execute "-50I8" and return -50', () => {
    validate("-50I8", -50);
  });

  it('should reject "-129I8"', () => {
    invalidate("-129I8");
  });

  it('should reject "128I8"', () => {
    invalidate("128I8");
  });

  it('should execute "-1000I16" and return -1000', () => {
    validate("-1000I16", -1000);
  });

  it('should reject "-32769I16"', () => {
    invalidate("-32769I16");
  });

  it('should reject "32768I16"', () => {
    invalidate("32768I16");
  });

  it('should execute("-100000I32" , -100000)', () => {
    validate("-100000I32", -100000);
  });

  it('should reject "-2147483649I32"', () => {
    invalidate("-2147483649I32");
  });

  it('should reject "2147483648I32"', () => {
    invalidate("2147483648I32");
  });

  it('should execute "100I64" and return 100', () => {
    validate("100I64", 100);
  });

  it('should execute "1U8 + 2U8" and return 3', () => {
    validate("1U8 + 2U8", 3);
  });

  it('should reject "1U8 + 255U8"', () => {
    invalidate("1U8 + 255U8");
  });

  it('should reject "1U8 + 255"', () => {
    invalidate("1U8 + 255");
  });
});
