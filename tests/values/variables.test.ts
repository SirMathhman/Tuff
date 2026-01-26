import { describe } from "bun:test";
import { itBoth, itInterpreter } from "../test-helpers";

describe("variables - basic", () => {
  itBoth("supports simple variable declaration", (assertValid) => {
    assertValid("let x : I32 = 3; x", 3);
  });

  itBoth(
    "handles variable declarations in grouped expressions",
    (assertValid) => {
      assertValid("{ let x : I32 = 3; x }", 3);
    },
  );

  itBoth("supports variable declarations with type annotations", (ok) => {
    ok("(2 + { let x : I32 = 3; x }) * 4", 20);
  });

  itBoth("supports variable references in declarations", (assertValid) => {
    assertValid("let x : I32 = 100; let y : I32 = x; y", 100);
  });

  itBoth(
    "supports variable declarations without type annotations",
    (assertValid) => {
      assertValid("let x = 100; let y = x; y", 100);
    },
  );

  itBoth(
    "throws on duplicate variable declaration in same scope",
    (assertValid, assertInvalid) => {
      assertInvalid("let x = 100; let x = 200; x");
    },
  );
});

describe("variables - type coercion", () => {
  itBoth(
    "allows narrower type assignment to wider type variable",
    (assertValid) => {
      assertValid("let x : U16 = 100U8; x", 100);
    },
  );

  itBoth(
    "throws when assigning wider type to narrower type variable",
    (assertValid, assertInvalid) => {
      assertInvalid("let x : U8 = 100U16; x");
    },
  );

  itBoth(
    "throws when assigning variable of wider type to narrower type variable",
    (_, bad) => {
      bad("let x = 100U16; let y : U8 = x; y");
    },
  );
});

describe("variables - mutable", () => {
  itBoth("supports mutable variable assignment", (assertValid) => {
    assertValid("let mut x = 0; x = 100; x", 100);
  });

  itBoth(
    "throws when reassigning immutable variable",
    (assertValid, assertInvalid) => {
      assertInvalid("let x = 0; x = 100; x");
    },
  );

  itBoth(
    "allows mutable variable reassignment inside grouped expressions",
    (assertValid) => {
      assertValid("let mut x = 0; { x = 100; } x", 100);
    },
  );

  // Compiler doesn't track scope boundaries for variable lifetime
  itInterpreter(
    "throws when variable is declared inside grouped expressions and used outside",
    (_, bad) => {
      bad("{ let mut x = 0; } x = 100; x");
    },
  );
});

describe("variables - uninitialized", () => {
  itBoth("supports uninitialized variable declaration", (ok) => {
    ok("let x : I32; x = 100; x", 100);
  });

  itBoth(
    "throws when reassigning uninitialized variable without mut",
    (assertValid, assertInvalid) => {
      assertInvalid("let x : I32; x = 10; x = 20; x");
    },
  );

  itBoth("supports mut uninitialized variable declaration", (assertValid) => {
    assertValid("let mut x : I32; x = 10; x = 20; x", 20);
  });

  // Compiler doesn't track uninitialized variable assignments through control flow branches
  itInterpreter(
    "supports variable assignment inside if-else branches",
    (ok) => {
      ok("let x : I32; if (true) x = 10; else x = 20; x", 10);
    },
  );
});

describe("variables - pointers", () => {
  itBoth("supports pointer creation and dereferencing", (ok) => {
    ok("let x = 100; let y : *I32 = &x; *y", 100);
  });

  itBoth("supports pointer dereferencing with modification", (ok) => {
    ok("let mut x = 100; let y : *I32 = &x; *y", 100);
  });

  itBoth("supports chained pointer operations", (ok) => {
    ok("let x = 42; let p = &x; let pp : *I32 = p; *pp", 42);
  });

  itBoth("supports mutable pointer with dereferencing assignment", (ok) => {
    ok("let mut x = 100; let y : *mut I32 = &x; *y = 100; x", 100);
  });

  itBoth("supports pointer access to array elements", (ok) => {
    ok(
      "let array = [1, 2, 3]; let slice : *[I32] = &array; slice[0] + slice[1] + slice[2]",
      6,
    );
  });
});

describe("variables - this keyword", () => {
  itBoth(
    "supports calling function via this.methodName() at global scope",
    (assertValid) => {
      assertValid("fn get() => 100; this.get()", 100);
    },
  );

  itBoth("supports function with parameters called via this", (ok) => {
    ok("fn add(a : I32, b : I32) => a + b; this.add(10, 20)", 30);
  });

  itBoth("supports this in function returning value", (ok) => {
    ok("fn getValue() => 42; fn wrapper() => this.getValue(); wrapper()", 42);
  });

  itBoth(
    "supports function returning this with nested function",
    (assertValid) => {
      assertValid(
        "fn Wrapper(value : I32) => { fn get() => value; this }; Wrapper(100).get()",
        100,
      );
    },
  );

  itBoth(
    "supports nested functions in function returning this",
    (assertValid) => {
      assertValid(
        "fn getAdder(a : I32) => { fn add(b : I32) => a + b; this }; getAdder(10).add(5)",
        15,
      );
    },
  );
});
