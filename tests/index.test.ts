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

  it("should add multiple untyped numbers in sequence", () => {
    expectValid("1 + 2 + 3", 6);
  });

  it("should add and subtract untyped numbers", () => {
    expectValid("2 + 3 - 4", 1);
  });

  it("should multiply and subtract untyped numbers", () => {
    expectValid("2 * 3 - 4", 2);
  });

  it("should add and multiply untyped numbers with correct precedence", () => {
    expectValid("4 + 2 * 3", 10);
  });

  it("should evaluate parenthesized expressions", () => {
    expectValid("(4 + 2) * 3", 18);
  });

  it("should divide two untyped numbers", () => {
    expectValid("10 / 5", 2);
  });

  it("should return error for division by zero", () => {
    expectInvalid("10 / (2 - 2)");
  });

  it("should handle curly braces like parentheses", () => {
    expectValid("10 / { 5 }", 2);
  });
});

describe("interpret - variable declarations", () => {
  it("should handle variable declarations in blocks", () => {
    expectValid("10 / { let x : U8 = 5; x }", 2);
  });

  it("should handle nested variable blocks in assignments", () => {
    expectValid("let x : U8 = { let y : U8 = 100; y }; x", 100);
  });

  it("should handle multiple variable declarations", () => {
    expectValid("{ let x : U8 = 3; let y : U8 = 2; x + y }", 5);
  });

  it("should handle variable shadowing", () => {
    expectValid("{ let x : U8 = 5; { let x : U8 = 10; x } }", 10);
  });

  it("should access outer scope variables after inner scope", () => {
    expectValid("{ let x : U8 = 5; { let y : U8 = 10; y }; x }", 5);
  });
});

describe("interpret - variable error handling", () => {
  it("should return error for undefined variable", () => {
    expectInvalid("x");
  });

  it("should return error for undefined variable in expression", () => {
    expectInvalid("x + 5");
  });

  it("should return error for duplicate variable declaration", () => {
    expectInvalid("{ let x : U8 = 5; let x : U8 = 10; x }");
  });

  it("should return error for duplicate variable in nested scope", () => {
    expectInvalid("{ let x : U8 = 5; { let x : U8 = 10; let x : U8 = 20; x } }");
  });

  it("should return error for invalid type in variable declaration", () => {
    expectInvalid("let x : InvalidType = 5; x");
  });

  it("should return error for type overflow in variable declaration", () => {
    expectInvalid("let x : U8 = 256; x");
  });
});

describe("interpret - variable type coercion", () => {
  it("should allow widening from U8 to U16", () => {
    expectValid("let x = 100U8; let y : U16 = x; y", 100);
  });

  it("should allow widening from U8 to U32", () => {
    expectValid("let x = 100U8; let y : U32 = x; y", 100);
  });

  it("should allow widening from U16 to U32", () => {
    expectValid("let x = 100U16; let y : U32 = x; y", 100);
  });

  it("should allow widening from I8 to I16", () => {
    expectValid("let x = 50I8; let y : I16 = x; y", 50);
  });

  it("should return error when narrowing from U16 to U8", () => {
    expectInvalid("let x = 100U16; let y : U8 = x; y");
  });

  it("should return error when narrowing from U32 to U16", () => {
    expectInvalid("let x = 100U32; let y : U16 = x; y");
  });

  it("should return error when narrowing from I16 to I8", () => {
    expectInvalid("let x = 50I16; let y : I8 = x; y");
  });

  it("should allow widening with arithmetic expressions", () => {
    expectValid("let x = 5U8; let y = 10U8; let z : U16 = x + y; z", 15);
  });
});

describe("interpret - mutable variables", () => {
  it("should declare mutable variable with let mut", () => {
    expectValid("let mut x = 0; x", 0);
  });

  it("should allow reassigning mutable variable", () => {
    expectValid("let mut x = 0; x = 100; x", 100);
  });

  it("should maintain type through reassignment", () => {
    expectValid("let mut x = 5U8; x = 10U8; x", 10);
  });

  it("should allow multiple reassignments", () => {
    expectValid("let mut x = 0; x = 10; x = 20; x = 30; x", 30);
  });

  it("should return error when reassigning immutable variable", () => {
    expectInvalid("let x = 0; x = 100; x");
  });

  it("should return error when assigning to undefined variable", () => {
    expectInvalid("x = 100; x");
  });

  it("should return error when reassignment violates type range", () => {
    expectInvalid("let mut x = 5U8; x = 256; x");
  });

  it("should allow mutable variable in nested blocks", () => {
    expectValid("{ let mut x = 0; x = 100; x }", 100);
  });

  it("should shadow mutable with immutable variable", () => {
    expectValid("let mut x = 5; { let x = 10; x }", 10);
  });

  it("should not allow mutation of shadowed immutable variable", () => {
    expectInvalid("let x = 5; { let mut x = 10; x = 20 }");
  });

  it("should allow mutable variable with explicit type annotation", () => {
    expectValid("let mut x : U8 = 5; x = 10; x", 10);
  });

  it("should return error when reassignment doesn't match type", () => {
    expectInvalid("let mut x : U8 = 5; x = 256; x");
  });

  it("should return error when reassigning different typed value", () => {
    expectInvalid("let mut x : U8 = 0; x = 100U16; x");
  });

  it("should allow widening assignment to mutable variable", () => {
    expectValid("let mut x : U16 = 0; x = 100U8; x", 100);
  });
});

describe("interpret - pointers", () => {
  it("should handle simple pointer reference and dereference", () => {
    expectValid("let x : I32 = 100; let y : *I32 = &x; *y", 100);
  });

  it("should handle pointer to U32", () => {
    expectValid("let x : U32 = 42; let ptr : *U32 = &x; *ptr", 42);
  });

  it("should handle pointer in expressions", () => {
    expectValid("let x : I32 = 5; let ptr : *I32 = &x; *ptr + 10", 15);
  });

  it("should handle multi-level pointers", () => {
    expectValid("let x : I32 = 100; let p1 : *I32 = &x; let p2 : **I32 = &p1; **p2", 100);
  });

  it("should return error when pointer type doesn't match variable type", () => {
    expectInvalid("let x : U8 = 5; let ptr : *I32 = &x; *ptr");
  });

  it("should return error when referencing undefined variable", () => {
    expectInvalid("let ptr : *I32 = &undefined; *ptr");
  });

  it("should handle pointer dereference in arithmetic", () => {
    expectValid("let x : I32 = 10; let y : I32 = 20; let px : *I32 = &x; let py : *I32 = &y; *px + *py", 30);
  });
});

describe("interpret - mutable pointers", () => {
  it("should handle simple mutable pointer reference and assignment", () => {
    expectValid("let mut x : I32 = 100; let y : *mut I32 = &mut x; *y = 200; x", 200);
  });

  it("should handle mutable pointer to U32", () => {
    expectValid("let mut x : U32 = 42; let ptr : *mut U32 = &mut x; *ptr = 100; x", 100);
  });

  it("should handle mutable pointer in expressions after assignment", () => {
    expectValid("let mut x : I32 = 5; let ptr : *mut I32 = &mut x; *ptr = 10; *ptr + 5", 15);
  });

  it("should allow multiple mutable pointer assignments", () => {
    expectValid("let mut x : I32 = 100; let y : *mut I32 = &mut x; *y = 200; let z : *mut I32 = &mut x; *z = 300; x", 300);
  });

  it("should return error when trying to create mutable reference to immutable variable", () => {
    expectInvalid("let x : I32 = 100; let ptr : *mut I32 = &mut x; *ptr");
  });

  it("should return error when assigning wrong type through mutable pointer", () => {
    expectInvalid("let mut x : U8 = 10; let ptr : *mut U8 = &mut x; *ptr = 300; x");
  });

  it("should return error when mutable pointer type doesn't match variable type", () => {
    expectInvalid("let mut x : U8 = 5; let ptr : *mut I32 = &mut x; *ptr = 10");
  });

  it("should return error when dereferencing immutable pointer assignment", () => {
    expectInvalid("let mut x : I32 = 100; let ptr : *I32 = &x; *ptr = 200; x");
  });

  it("should update original variable through mutable pointer", () => {
    expectValid("let mut x : I32 = 0; let y : *mut I32 = &mut x; *y = 100; x", 100);
  });
});

describe("interpret - arrays", () => {
  it("should create and access simple array", () => {
    expectValid("let array : [I32; 3; 3] = <I32>[1, 2, 3]; array[0]", 1);
  });

  it("should access different array indices", () => {
    expectValid("let array : [I32; 3; 3] = <I32>[10, 20, 30]; array[1]", 20);
  });

  it("should access last array element", () => {
    expectValid("let array : [I32; 3; 3] = <I32>[10, 20, 30]; array[2]", 30);
  });

  it("should create array with U32 type", () => {
    expectValid("let array : [U32; 2; 2] = <U32>[100, 200]; array[0]", 100);
  });

  it("should handle array with mutable variable", () => {
    expectValid("let mut array : [I32; 2; 2] = <I32>[5, 10]; array[0]", 5);
  });

  it("should assign to array element", () => {
    expectValid("let mut array : [I32; 2; 2] = <I32>[5, 10]; array[0] = 100; array[0]", 100);
  });

  it("should update both array elements", () => {
    expectValid("let mut array : [I32; 2; 2] = <I32>[5, 10]; array[0] = 100; array[1] = 200; array[1]", 200);
  });

  it("should return error for immutable array assignment", () => {
    expectInvalid("let array : [I32; 2; 2] = <I32>[5, 10]; array[0] = 100; array[0]");
  });

  it("should return error for array index out of bounds", () => {
    expectInvalid("let array : [I32; 2; 2] = <I32>[5, 10]; array[5]");
  });

  it("should return error for negative array index", () => {
    expectInvalid("let array : [I32; 2; 2] = <I32>[5, 10]; array[-1]");
  });

  it("should return error for array initialization mismatch", () => {
    expectInvalid("let array : [I32; 3; 3] = <I32>[1, 2]; array[0]");
  });

  it("should return error for type mismatch in array initialization", () => {
    expectInvalid("let array : [I32; 2; 2] = <U32>[5, 10]; array[0]");
  });
});

describe("interpret - functions", () => {
  it("should declare and call simple function", () => {
    expectValid("fn add(first : I32, second : I32) : I32 => { first + second }; add(3, 4)", 7);
  });

  it("should call function with different parameters", () => {
    expectValid("fn multiply(a : I32, b : I32) : I32 => { a * b }; multiply(5, 6)", 30);
  });

  it("should handle function with single parameter", () => {
    expectValid("fn double(x : I32) : I32 => { x * 2 }; double(10)", 20);
  });

  it("should handle function with no parameters", () => {
    expectValid("fn constant() : I32 => { 42 }; constant()", 42);
  });

  it("should support function with arithmetic expression", () => {
    expectValid("fn calculate(x : I32, y : I32) : I32 => { x * 2 + y }; calculate(3, 5)", 11);
  });

  it("should support function with U32 type", () => {
    expectValid("fn addU32(a : U32, b : U32) : U32 => { a + b }; addU32(10U32, 20U32)", 30);
  });

  it("should return error for undefined function", () => {
    expectInvalid("undefined()");
  });

  it("should return error for function with wrong number of arguments", () => {
    expectInvalid("fn add(a : I32, b : I32) : I32 => { a + b }; add(5)");
  });

  it("should return error for function with type mismatch", () => {
    expectInvalid("fn add(a : I32, b : I32) : I32 => { a + b }; add(5U32, 3)");
  });

  it("should handle function body with multiple operations", () => {
    expectValid("fn complex(x : I32) : I32 => { x + 5 * 2 }; complex(3)", 13);
  });

  it("should support function with parenthesized expressions", () => {
    expectValid("fn paren(x : I32) : I32 => { (x + 2) * 3 }; paren(4)", 18);
  });
});

describe("interpret - array parameters", () => {
  it("should pass array to function after initialization", () => {
    expectValid("let mut array : [I32; 0; 3]; array[0] = 100; fn getFirst(arr : [I32; 1; 3]) : I32 => { arr[0] }; getFirst(array)", 100);
  });

  it("should return error when array has insufficient initialized elements", () => {
    expectInvalid("let mut array : [I32; 0; 3]; fn getFirst(arr : [I32; 1; 3]) : I32 => { arr[0] }; getFirst(array)");
  });

  it("should pass array with multiple initialized elements", () => {
    expectValid("let mut array : [I32; 0; 5]; array[0] = 10; array[1] = 20; fn getSecond(arr : [I32; 2; 5]) : I32 => { arr[1] }; getSecond(array)", 20);
  });

  it("should return error when array exceeds capacity requirement", () => {
    expectInvalid("let mut array : [I32; 0; 2]; array[0] = 100; fn needsMore(arr : [I32; 1; 5]) : I32 => { arr[0] }; needsMore(array)");
  });

  it("should accept array with exact capacity match", () => {
    expectValid("let mut array : [I32; 1; 3]; array[0] = 42; fn getExact(arr : [I32; 1; 3]) : I32 => { arr[0] }; getExact(array)", 42);
  });

  it("should return error on element type mismatch", () => {
    expectInvalid("let mut array : [U32; 1; 3]; array[0] = 100U32; fn getI32(arr : [I32; 1; 3]) : I32 => { arr[0] }; getI32(array)");
  });
});
