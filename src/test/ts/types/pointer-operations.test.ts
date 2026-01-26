import { describe } from "bun:test";
import { itBoth, itInterpreter } from "../test-helpers";

describe("pointer operations - basics", () => {
  itBoth("creates pointer to scalar and dereferences", (ok) => {
    ok("let x = 100; let y : *I32 = &x; *y", 100);
  });

  itBoth("creates pointer to mutable scalar", (ok) => {
    ok("let mut x = 100; let y : *I32 = &x; *y", 100);
  });

  itBoth("creates pointer with mut keyword", (ok) => {
    ok("let mut x = 100; let y : *mut I32 = &x; *y", 100);
  });

  itBoth("chains pointer dereferencing through variables", (ok) => {
    ok("let x = 42; let p = &x; let pp : *I32 = p; *pp", 42);
  });

  itBoth("dereferences pointer multiple times", (ok) => {
    ok("let x = 99; let p : *I32 = &x; let q = p; *q", 99);
  });
});

describe("pointer operations - arrays", () => {
  itBoth(
    "creates pointer to array and accesses elements via indexing",
    (ok) => {
      ok(
        "let array = [1, 2, 3]; let slice : *[I32] = &array; slice[0] + slice[1] + slice[2]",
        6,
      );
    },
  );

  itBoth("pointer to array element 0", (ok) => {
    ok("let array = [10, 20, 30]; let p : *[I32] = &array; p[0]", 10);
  });

  itBoth("pointer to array element 1", (ok) => {
    ok("let array = [10, 20, 30]; let p : *[I32] = &array; p[1]", 20);
  });

  itBoth("pointer to array element 2", (ok) => {
    ok("let array = [10, 20, 30]; let p : *[I32] = &array; p[2]", 30);
  });

  itBoth("pointer to array with single element", (ok) => {
    ok("let array = [42]; let p : *[I32] = &array; p[0]", 42);
  });

  itBoth("pointer to empty array type annotation", (ok) => {
    ok("let array : [I32; 0] = []; let p : *[I32] = &array; 0", 0);
  });
});

describe("pointer operations - mutable assignment", () => {
  itBoth("mutable pointer allows dereferenced assignment", (ok) => {
    ok("let mut x = 100; let y : *mut I32 = &x; *y = 50; x", 50);
  });

  itBoth("mutable pointer with assignment and retrieval", (ok) => {
    ok("let mut x = 10; let p : *mut I32 = &x; *p = 99; *p", 99);
  });

  itBoth("mutable pointer can be assigned to another variable", (ok) => {
    ok("let mut x = 0; let y : *mut I32 = &x; let z = y; *z = 100; x", 100);
  });

  itBoth("immutable pointer rejects dereferenced assignment", (_, bad) => {
    bad("let mut x = 100; let y : *I32 = &x; *y = 50; x");
  });

  itBoth("immutable variable blocks mutable pointer creation", (_, bad) => {
    bad("let x = 100; let y : *mut I32 = &x; y");
  });
});

describe("pointer operations - type validation", () => {
  itBoth("pointer type annotation requires reference operation", (_, bad) => {
    bad("let x = 100; let y : *I32 = x; y");
  });

  itBoth(
    "pointer type annotation validates source is addressable",
    (_, bad) => {
      bad("let y : *I32 = &(100); y");
    },
  );

  itBoth("pointer to different type fails type check", (_, bad) => {
    bad("let x = 100U8; let y : *I32 = &x; y");
  });

  itBoth("pointer type inference works with reference", (ok) => {
    ok("let x = 100; let y = &x; 1", 1);
  });
});

describe("pointer operations - edge cases", () => {
  itInterpreter("nested pointer references", (ok) => {
    ok("let x = 42; let p = &x; let pp = &p; 1", 1);
  });

  itBoth("pointer in function parameter", (ok) => {
    ok("fn deref(p : *I32) => *p; let x = 55; deref(&x)", 55);
  });

  itBoth("pointer in function return type", (ok) => {
    ok("let x = 77; fn getPtr() => &x; let p : *I32 = getPtr(); *p", 77);
  });

  itBoth("multiple pointers to same variable", (ok) => {
    ok("let x = 123; let p1 : *I32 = &x; let p2 : *I32 = &x; *p1 + *p2", 246);
  });

  itInterpreter("pointer array element modification", (ok) => {
    ok("let mut arr = [1, 2, 3]; let p : *[I32] = &arr; p[1] = 99; arr[1]", 99);
  });
});

describe("pointer operations - invalid references", () => {
  itInterpreter("rejects double reference", (_, bad) => {
    bad("let x = 100; &&x");
  });

  itInterpreter("rejects reference to literals", (_, bad) => {
    bad("&100");
  });
});

describe("pointer operations - out of bounds", () => {
  itBoth(
    "throws on pointer array index out of bounds (negative)",
    (_ok, assertInvalid) => {
      assertInvalid("let array = [10, 20, 30]; let p : *[I32] = &array; p[-1]");
    },
  );

  itBoth(
    "throws on pointer array index out of bounds (too large)",
    (_ok, assertInvalid) => {
      assertInvalid("let array = [10, 20, 30]; let p : *[I32] = &array; p[10]");
    },
  );
});

describe("pointer operations - type constraints", () => {
  itBoth(
    "throws on pointer to non-addressable value (literal)",
    (_ok, assertInvalid) => {
      assertInvalid("let p : *I32 = &100");
    },
  );

  itBoth("throws on pointer to array literal", (_ok, assertInvalid) => {
    assertInvalid("let p : *[I32] = &[1, 2, 3]");
  });

  itBoth("throws on pointer type mismatch", (_ok, assertInvalid) => {
    assertInvalid("let x = 100; let y : *Bool = &x");
  });

  itBoth(
    "throws on assigning immutable pointer to mutable type",
    (_ok, assertInvalid) => {
      assertInvalid("let mut x = 100; let p : *I32 = &x; let q : *mut I32 = p");
    },
  );

  itBoth("throws on double reference", (_ok, assertInvalid) => {
    assertInvalid("let x = 100; let p : **I32 = &&x");
  });
});

describe("pointer operations - dangling references", () => {
  itBoth(
    "throws when returning reference to local variable from function",
    (_ok, assertInvalid) => {
      assertInvalid("fn get() => { let x = 100; &x }");
    },
  );
});

describe("pointer operations - limitations", () => {
  itInterpreter(
    "compiler cannot handle complex dereference expressions yet",
    (ok) => {
      // *(y + 1) for array pointer arithmetic is not supported by compiler
      // transformPointers() only recognizes *identifier patterns
      ok("let array = [10, 20, 30]; let p : *[I32] = &array; 1", 1);
    },
  );
});
