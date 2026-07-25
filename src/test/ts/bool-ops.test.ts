import { test } from "bun:test";
import { expectValid, expectInvalid } from "./test-helpers";

// --- AND Truth Table (literals) ---

test("true && true", () => {
  expectValid("true && true", [], 1);
});

test("true && false exits 0", () => {
  expectValid("true && false", [], 0);
});

test("false && true exits 0", () => {
  expectValid("false && true", [], 0);
});

test("false && false exits 0", () => {
  expectValid("false && false", [], 0);
});

// --- OR Truth Table (literals) ---

test("true || true", () => {
  expectValid("true || true", [], 1);
});

test("true || false", () => {
  expectValid("true || false", [], 1);
});

test("false || true", () => {
  expectValid("false || true", [], 1);
});

test("false || false exits 0", () => {
  expectValid("false || false", [], 0);
});

// --- NOT (literals) ---

test("!true exits 0", () => {
  expectValid("!true", [], 0);
});

test("!false exits 1", () => {
  expectValid("!false", [], 1);
});

test("!!true", () => {
  expectValid("!!true", [], 1);
});

// --- Variables with Bool type annotation ---

test("AND with annotated variables true && true", () => {
  expectValid("let a : Bool = true; let b : Bool = true; a && b", [], 1);
});

test("AND with annotated variables true && false", () => {
  expectValid("let a : Bool = true; let b : Bool = false; a && b", [], 0);
});

test("OR with annotated variables false || true", () => {
  expectValid("let a : Bool = false; let b : Bool = true; a || b", [], 1);
});

test("!variable exits correct value", () => {
  expectValid("let a : Bool = true; !a", [], 0);
});

// --- Storing operator result in variable (with annotation) ---

test("AND result stored with annotation", () => {
  expectValid(
    "let a : Bool = true; let b : Bool = false; let c : Bool = a && b; c",
    [],
    0,
  );
});

test("OR result stored with annotation", () => {
  expectValid(
    "let a : Bool = false; let b : Bool = true; let c : Bool = a || b; c",
    [],
    1,
  );
});

// --- Inference: no type annotation needed for bool expressions ---

test("Inferred bare boolean literal is valid", () => {
  expectValid("let x = true; x", [], 1);
});

test("Inferred false bare boolean literal exits 0", () => {
  expectValid("let y = false; y", [], 0);
});

test("Inferred AND result is valid", () => {
  expectValid(
    "let a : Bool = true; let b : Bool = false; let c = a && b; c",
    [],
    0,
  );
});

test("Inferred OR result is valid", () => {
  expectValid(
    "let a : Bool = false; let b : Bool = true; let c = a || b; c",
    [],
    1,
  );
});

// --- Chained operators ---

test("Chained AND: true && true && true", () => {
  expectValid("true && true && true", [], 1);
});

test("Chained AND with false in middle exits 0", () => {
  expectValid("true && false && true", [], 0);
});

test("Chained OR: false || false || true", () => {
  expectValid("false || false || true", [], 1);
});

// --- Mixed operators ---

test("AND has precedence over OR in JS (|| is lower)", () => {
  // In JS, && binds tighter than ||. So `true || false && false` =
  // `true || (false && false)` = true || false = true
  expectValid("true || false && false", [], 1);
});

test("OR and AND mixed: false || true && true", () => {
  // false || (true && true) = false || true = true
  expectValid("false || true && true", [], 1);
});

// --- NOT with variables ---

test("!variable that is false exits 1", () => {
  expectValid("let b : Bool = false; !b", [], 1);
});

test("NOT stored in variable", () => {
  expectValid("let a : Bool = true; let c : Bool = !a; c", [], 0);
});

// --- Operator with is expression result ---

test("AND of two is expressions both matching exits 1", () => {
  expectValid("42I32 is I32 && true", [], 1);
});

test("OR where left side is false variable exits right value", () => {
  expectValid(
    "struct S { x : I32 }; let n : I32 = 1I32; let f : Bool = n is S; f || true",
    [],
    1,
  );
});

// --- Mutability with bool operators ---

test("Mut bool reassignment with AND result", () => {
  expectValid(
    "let mut x : Bool = true; let y : Bool = false; x = x && y; x",
    [],
    0,
  );
});

// --- ERROR CASES: non-Bool operands ---

test("AND with number literal is invalid", () => {
  expectInvalid("true && 42");
});

test("OR with number variable is invalid", () => {
  expectInvalid("let x : I32 = 1I32; true || x");
});

test("NOT on number variable is invalid", () => {
  expectInvalid("let x : I32 = 1I32; !x");
});

test("AND with struct instance is invalid", () => {
  expectInvalid("struct S { x : I32 }; let s : S = S { x: 1I32 }; true && s");
});

test("OR mixing Bool and number literal is invalid", () => {
  expectInvalid("42 || false");
});

// --- ERROR CASES: type mismatch with annotation ---

test("AND result assigned to U8 is invalid", () => {
  expectInvalid(
    "let a : Bool = true; let b : Bool = true; let c : U8 = a && b;",
  );
});

test("OR result assigned to I32 is invalid", () => {
  expectInvalid(
    "let x : Bool = false; let y : Bool = true; let z : I32 = x || y;",
  );
});

// --- Edge: operator at top-level exit expression ---

test("AND as bare exit expression exits correct value", () => {
  expectValid("true && false", [], 0);
});

test("OR as bare exit expression exits correct value", () => {
  expectValid("false || true", [], 1);
});

// --- Edge: mutable bool with operator reassignment ---

test("Mut bool reassigned via NOT", () => {
  expectValid("let mut x : Bool = true; x = !x; x", [], 0);
});
