import { interpret } from "../src/index";


function expectValid(input: string, expected: number | bigint): void {
  const result = interpret(input);
  if (!result.success) {
    throw new Error("Expected valid result but got error: " + result.error);
  }
  expect(result.data).toBe(expected);
}

function expectInvalid(input: string): void {
  const result = interpret(input);
  if (result.success) {
    throw new Error("Expected error but got valid result: " + result.data);
  }
}

describe("interpret - simple numbers", () => {
  it("should interpret a simple number", () => {
    expectValid("100", 100);
  });
});

describe("interpret - U8", () => {
  it("should interpret valid U8 numbers", () => {
    expectValid("100U8", 100);
    expectValid("0U8", 0);
    expectValid("255U8", 255);
  });

  it("should return error for negative U8 numbers", () => {
    expectInvalid("-100U8");
  });

  it("should return error for U8 numbers exceeding range", () => {
    expectInvalid("256U8");
  });
});

describe("interpret - U16", () => {
  it("should interpret valid U16 numbers", () => {
    expectValid("100U16", 100);
    expectValid("65535U16", 65535);
  });

  it("should return error for negative U16 numbers", () => {
    expectInvalid("-100U16");
  });

  it("should return error for U16 numbers exceeding range", () => {
    expectInvalid("65536U16");
  });
});

describe("interpret - U32", () => {
  it("should interpret valid U32 numbers", () => {
    expectValid("100U32", 100);
    expectValid("4294967295U32", 4294967295);
  });

  it("should return error for negative U32 numbers", () => {
    expectInvalid("-100U32");
  });

  it("should return error for U32 numbers exceeding range", () => {
    expectInvalid("4294967296U32");
  });
});

describe("interpret - U64", () => {
  it("should interpret valid U64 numbers", () => {
    expectValid("100U64", 100n);
    expectValid("18446744073709551615U64", 18446744073709551615n);
  });

  it("should return error for negative U64 numbers", () => {
    expectInvalid("-100U64");
  });

  it("should return error for U64 numbers exceeding range", () => {
    expectInvalid("18446744073709551616U64");
  });
});

describe("interpret - I8", () => {
  it("should interpret valid I8 numbers", () => {
    expectValid("100I8", 100);
    expectValid("-100I8", -100);
    expectValid("127I8", 127);
    expectValid("-128I8", -128);
  });

  it("should return error for I8 numbers exceeding positive range", () => {
    expectInvalid("128I8");
  });

  it("should return error for I8 numbers exceeding negative range", () => {
    expectInvalid("-129I8");
  });
});

describe("interpret - I16", () => {
  it("should interpret valid I16 numbers", () => {
    expectValid("100I16", 100);
    expectValid("-100I16", -100);
    expectValid("32767I16", 32767);
    expectValid("-32768I16", -32768);
  });

  it("should return error for I16 numbers exceeding positive range", () => {
    expectInvalid("32768I16");
  });

  it("should return error for I16 numbers exceeding negative range", () => {
    expectInvalid("-32769I16");
  });
});

describe("interpret - I32", () => {
  it("should interpret valid I32 numbers", () => {
    expectValid("100I32", 100);
    expectValid("-100I32", -100);
    expectValid("2147483647I32", 2147483647);
    expectValid("-2147483648I32", -2147483648);
  });

  it("should return error for I32 numbers exceeding positive range", () => {
    expectInvalid("2147483648I32");
  });

  it("should return error for I32 numbers exceeding negative range", () => {
    expectInvalid("-2147483649I32");
  });
});

describe("interpret - I64", () => {
  it("should interpret valid I64 numbers", () => {
    expectValid("100I64", 100n);
    expectValid("-100I64", -100n);
    expectValid("9223372036854775807I64", 9223372036854775807n);
    expectValid("-9223372036854775808I64", -9223372036854775808n);
  });

  it("should return error for I64 numbers exceeding positive range", () => {
    expectInvalid("9223372036854775808I64");
  });

  it("should return error for I64 numbers exceeding negative range", () => {
    expectInvalid("-9223372036854775809I64");
  });
});

describe("interpret - arithmetic operations", () => {
  it("should add two U8 numbers", () => {
    expectValid("1U8 + 2U8", 3);
  });

  it("should return error when U8 addition overflows", () => {
    expectInvalid("1U8 + 255U8");
  });

  it("should return error when adding mismatched types (U8 + untyped)", () => {
    expectInvalid("1U8 + 255");
  });

  it("should add U8 and U16 with type coercion to wider type", () => {
    expectValid("1U8 + 255U16", 256);
  });

  it("should add two untyped numbers", () => {
    expectValid("1 + 2", 3);
  });
});
