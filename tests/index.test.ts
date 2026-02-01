import { interpret } from "../src/index";

type Result<T, E> = { success: true; data: T } | { success: false; error: E };

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.success) {
    return result.data;
  }
  throw new Error(`Failed: ${result.error}`);
}

function expectError<T, E>(result: Result<T, E>): E {
  if (!result.success) {
    return result.error;
  }
  throw new Error(`Expected error but got: ${result.data}`);
}

describe("interpret", () => {
  it("should interpret a simple number", () => {
    expect(unwrap(interpret("100"))).toBe(100);
  });

  it("should interpret number with U8 suffix", () => {
    expect(unwrap(interpret("100U8"))).toBe(100);
  });

  it("should return error for negative number with U8 suffix", () => {
    expect(expectError(interpret("-100U8"))).toBe("Negative numbers cannot have U8 suffix");
  });
});
