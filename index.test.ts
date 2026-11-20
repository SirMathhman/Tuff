import { expect, test } from "bun:test";
import { interpretTuff } from "./index";

test("interpretTuff('1') => 1", () => {
  expect(interpretTuff("1")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff('1 + 2') => 3", () => {
  expect(interpretTuff("1 + 2")).toEqual({ ok: true, value: 3 });
});

test("interpretTuff('1 + 2 + 3') => 6", () => {
  expect(interpretTuff("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
});

test("interpretTuff('2 + 3 - 4') => 1", () => {
  expect(interpretTuff("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff('2 * 3 + 4') => 10", () => {
  expect(interpretTuff("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
});

test("interpretTuff('2 + 3 * 4') => 14", () => {
  expect(interpretTuff("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
});

test("interpretTuff('(2 + 3) * 4') => 20", () => {
  expect(interpretTuff("(2 + 3) * 4")).toEqual({ ok: true, value: 20 });
});

test("interpretTuff('{ 2 + 3 } * 4') => 20", () => {
  expect(interpretTuff("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
});

test("interpretTuff('{ let x = 2 + 3; x } * 4') => 20", () => {
  expect(interpretTuff("{ let x = 2 + 3; x } * 4")).toEqual({ ok: true, value: 20 });
});

test("interpretTuff('let y = { let x = 2 + 3; x } * 4; y') => 20", () => {
  expect(interpretTuff("let y = { let x = 2 + 3; x } * 4; y")).toEqual({ ok: true, value: 20 });
});

test("interpretTuff('let mut x = 0; x = 1; x') => 1", () => {
  expect(interpretTuff("let mut x = 0; x = 1; x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff assignment to an immutable variable is rejected", () => {
  const result = interpretTuff("let x = 0; x = 1; x");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain('found "x" where a mutable variable (declare "x" with "let mut") was expected');
});

test("interpretTuff('let x = true; x') => 1", () => {
  expect(interpretTuff("let x = true; x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff('false') => 0", () => {
  expect(interpretTuff("false")).toEqual({ ok: true, value: 0 });
});

test("interpretTuff('let true = 1; true') is rejected", () => {
  expect(interpretTuff("let true = 1; true").ok).toBe(false);
});

test("interpretTuff('1 == 1') => 1", () => {
  expect(interpretTuff("1 == 1")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff('1 == true') is an error: values of different types", () => {
  const result = interpretTuff("1 == true");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain('a value of the same type as the left side of "=="');
});

test("interpretTuff('true == true') => 1", () => {
  expect(interpretTuff("true == true")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff('true + 1') is an error: arithmetic needs numbers", () => {
  expect(interpretTuff("true + 1").ok).toBe(false);
});

test("interpretTuff('let x = 1; let y = &x; *y') => 1", () => {
  expect(interpretTuff("let x = 1; let y = &x; *y")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff reads a reference's current value", () => {
  expect(interpretTuff("let mut x = 1; let y = &x; x = 2; *y")).toEqual({ ok: true, value: 2 });
});

test("interpretTuff rejects a reference that outlives its variable", () => {
  expect(interpretTuff("let y = { let x = 1; &x }; *y").ok).toBe(false);
  expect(interpretTuff("let mut y = &0; { let x = 1; y = &x; } *y").ok).toBe(false);
});

test("interpretTuff('let mut x = 0; let y = &mut x; *y = 1; x') => 1", () => {
  expect(interpretTuff("let mut x = 0; let y = &mut x; *y = 1; x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff('let mut x = 0; let y = &mut x; let z = &y; *(*z) = 1; x') => 1", () => {
  expect(interpretTuff("let mut x = 0; let y = &mut x; let z = &y; *(*z) = 1; x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff rejects assigning through a non-reference", () => {
  expect(interpretTuff("let mut x = 0; *x = 1; x").ok).toBe(false);
});

test("interpretTuff('*y == 1' as a final comparison) is not an assignment", () => {
  expect(interpretTuff("let x = 1; let y = &x; *y == 1")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff rejects &mut of an immutable variable", () => {
  expect(interpretTuff("let x = 0; let y = &mut x; *y").ok).toBe(false);
});

test("interpretTuff rejects assigning through a shared reference", () => {
  expect(interpretTuff("let mut x = 0; let y = &x; *y = 1; x").ok).toBe(false);
});

test("interpretTuff rejects a program whose result is a reference", () => {
  expect(interpretTuff("let x = 1; &x").ok).toBe(false);
});

test("interpretTuff rejects '*' applied to a non-reference", () => {
  expect(interpretTuff("let x = 1; *x").ok).toBe(false);
});

test("interpretTuff('if (true) 2 else 3') => 2", () => {
  expect(interpretTuff("if (true) 2 else 3")).toEqual({ ok: true, value: 2 });
});

test("interpretTuff('if (false) 2 else 3') => 3", () => {
  expect(interpretTuff("if (false) 2 else 3")).toEqual({ ok: true, value: 3 });
});

test("interpretTuff: an untaken if branch does not run its assignments", () => {
  expect(interpretTuff("let mut x = 0; let y = if (false) { x = 1; 0 } else 0; x")).toEqual({ ok: true, value: 0 });
  expect(interpretTuff("let mut x = 0; let y = if (true) { x = 1; 0 } else 0; x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff rejects an if condition that is not a boolean", () => {
  expect(interpretTuff("if (1) 2 else 3").ok).toBe(false);
});

test("interpretTuff rejects an if without else", () => {
  expect(interpretTuff("if (true) 2").ok).toBe(false);
});

test("interpretTuff('let mut x = 0; { x = 1; } x') => 1", () => {
  expect(interpretTuff("let mut x = 0; { x = 1; } x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff: consecutive and nested statement blocks", () => {
  expect(interpretTuff("let mut x = 0; { x = 1; } { x = x + 1; } x")).toEqual({ ok: true, value: 2 });
  expect(interpretTuff("let mut x = 0; { { x = 1; } } x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff: a statement block's assignments run once", () => {
  expect(interpretTuff("let mut x = 0; { x = x + 1; x } * 2")).toEqual({ ok: true, value: 2 });
});

test("interpretTuff('let mut x = 0; if (true) { x = 1; } else { x = 2; } x') => 1", () => {
  expect(interpretTuff("let mut x = 0; if (true) { x = 1; } else { x = 2; } x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff: statement if takes the else branch when false, and works without else", () => {
  expect(interpretTuff("let mut x = 0; if (false) { x = 1; } else { x = 2; } x")).toEqual({ ok: true, value: 2 });
  expect(interpretTuff("let mut x = 0; if (false) { x = 1; } x")).toEqual({ ok: true, value: 0 });
  expect(interpretTuff("let mut x = 0; if (true) { x = 1; } x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff: statement if with single-statement branches", () => {
  expect(interpretTuff("let mut x = 0; if (true) x = 1; else x = 2; x")).toEqual({ ok: true, value: 1 });
  expect(interpretTuff("let mut x = 0; if (false) x = 1; else x = 2; x")).toEqual({ ok: true, value: 2 });
  expect(interpretTuff("let mut x = 0; if (false) x = 1; x")).toEqual({ ok: true, value: 0 });
});

test("interpretTuff rejects a program that ends with a statement if", () => {
  expect(interpretTuff("let mut x = 0; if (true) { x = 1; }").ok).toBe(false);
});

test("interpretTuff rejects a statement if with a non-boolean condition", () => {
  expect(interpretTuff("let mut x = 0; if (1) { x = 1; } x").ok).toBe(false);
});

test("interpretTuff rejects a program that ends with a statement block", () => {
  expect(interpretTuff("let mut x = 0; { x = 1; }").ok).toBe(false);
});

test("interpretTuff('let mut x = 1; x += 2; x') => 3", () => {
  expect(interpretTuff("let mut x = 1; x += 2; x")).toEqual({ ok: true, value: 3 });
});

test("interpretTuff: -= and *= compound assignments", () => {
  expect(interpretTuff("let mut x = 5; x -= 2; x")).toEqual({ ok: true, value: 3 });
  expect(interpretTuff("let mut x = 2; x *= 3; x")).toEqual({ ok: true, value: 6 });
});

test("interpretTuff rejects a compound assignment to an immutable or non-numeric variable", () => {
  expect(interpretTuff("let x = 1; x += 2; x").ok).toBe(false);
  expect(interpretTuff("let mut b = true; b += 1; b").ok).toBe(false);
});

test("interpretTuff('let mut x = 0; while (x < 4) { x += 1; } x') => 4", () => {
  expect(interpretTuff("let mut x = 0; while (x < 4) { x += 1; } x")).toEqual({ ok: true, value: 4 });
});

test("interpretTuff: '<' comparison", () => {
  expect(interpretTuff("1 < 2")).toEqual({ ok: true, value: 1 });
  expect(interpretTuff("2 < 1")).toEqual({ ok: true, value: 0 });
});

test("interpretTuff: while loop that never runs its body", () => {
  expect(interpretTuff("let mut x = 0; while (false) x += 1; x")).toEqual({ ok: true, value: 0 });
});

test("interpretTuff: for loop sums 0..10", () => {
  expect(interpretTuff("let mut sum = 0; for (let mut i = 0; i < 10; i += 1; ) { sum += i; } sum")).toEqual({
    ok: true,
    value: 45,
  });
});

test("interpretTuff: for loop with a single-statement body", () => {
  expect(interpretTuff("let mut sum = 0; for (let mut i = 0; i < 10; i += 1; ) sum += i; sum")).toEqual({
    ok: true,
    value: 45,
  });
});

test("interpretTuff: for loop body that never runs", () => {
  expect(interpretTuff("let mut s = 0; for (let mut i = 5; i < 3; i += 1; ) s += 1; s")).toEqual({
    ok: true,
    value: 0,
  });
});

test("interpretTuff rejects a for loop variable used after the loop", () => {
  expect(interpretTuff("for (let mut i = 0; i < 2; i += 1; ) i += 1; i").ok).toBe(false);
});

test("interpretTuff rejects a for condition that is not a boolean", () => {
  expect(interpretTuff("let mut s = 0; for (let mut i = 0; 1; i += 1; ) s += 1; s").ok).toBe(false);
});

test("interpretTuff: loop with if/else break", () => {
  expect(
    interpretTuff("let mut counter = 0; let x = loop { if (counter < 4) counter += 1; else break counter; }; x"),
  ).toEqual({ ok: true, value: 4 });
});

test("interpretTuff: break value ends a loop", () => {
  expect(interpretTuff("let x = loop { break 7; }; x")).toEqual({ ok: true, value: 7 });
});

test("interpretTuff: statements after break take no effect", () => {
  expect(interpretTuff("let mut s = 0; let x = loop { break 1; s += 1; }; s")).toEqual({ ok: true, value: 0 });
});

test("interpretTuff rejects break outside a loop", () => {
  expect(interpretTuff("break 1; 1").ok).toBe(false);
});

test("interpretTuff rejects break inside a while loop", () => {
  expect(interpretTuff("let x = loop { while (false) break 1; break 2; }; x").ok).toBe(false);
});

test("interpretTuff rejects a loop that never breaks", () => {
  expect(interpretTuff("let x = loop { }; x").ok).toBe(false);
});

test("interpretTuff rejects a while condition that is not a boolean", () => {
  expect(interpretTuff("let mut x = 0; while (1) x += 1; x").ok).toBe(false);
});

test("interpretTuff rejects a while loop that does not end", () => {
  expect(interpretTuff("let mut x = 0; while (true) x += 1; x").ok).toBe(false);
});

test("interpretTuff rejects == between references to values of different types", () => {
  expect(interpretTuff("let x = true; let y = 1; &x == &y").ok).toBe(false);
});

test("interpretTuff compares references by the values they point to", () => {
  expect(interpretTuff("let x = 1; let y = 1; &x == &y")).toEqual({ ok: true, value: 1 });
  expect(interpretTuff("let x = 1; let y = 2; &x == &y")).toEqual({ ok: true, value: 0 });
});

test("interpretTuff rejects == between a reference and a plain value", () => {
  expect(interpretTuff("let x = 1; &x == 1").ok).toBe(false);
});

test("interpretTuff('match (true) { case true => 1; case false => 2; }') => 1", () => {
  expect(interpretTuff("match (true) { case true => 1; case false => 2; }")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff: match picks the first equal case", () => {
  expect(interpretTuff("match (1) { case 2 => 10; case 1 => 20; }")).toEqual({ ok: true, value: 20 });
});

test("interpretTuff: match runs only the chosen arm's effects", () => {
  expect(
    interpretTuff("let mut x = 0; let y = match (2) { case 1 => { x = 5; 1 }; case 2 => { x = 9; 2 }; }; x"),
  ).toEqual({
    ok: true,
    value: 9,
  });
});

test("interpretTuff('match (true) { case _ => 1; }') => 1", () => {
  expect(interpretTuff("match (true) { case _ => 1; }")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff: wildcard arm after a non-matching case", () => {
  expect(interpretTuff("match (1) { case 2 => 10; case _ => 20; }")).toEqual({ ok: true, value: 20 });
});

test("interpretTuff rejects '_' as a variable name", () => {
  expect(interpretTuff("let _ = 1; 1").ok).toBe(false);
});

test("interpretTuff rejects a match with no equal case", () => {
  expect(interpretTuff("match (3) { case 1 => 1; }").ok).toBe(false);
});

test("interpretTuff rejects a case pattern of a different type", () => {
  expect(interpretTuff("match (true) { case 1 => 1; case true => 2; }").ok).toBe(false);
});

test("interpretTuff('fn get() => 1; get()') => 1", () => {
  expect(interpretTuff("fn get() => 1; get()")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff: function with parameters", () => {
  expect(interpretTuff("fn add(a, b) => a + b; add(2, 3)")).toEqual({ ok: true, value: 5 });
});

test("interpretTuff: function sees variables from its declaring scope", () => {
  expect(interpretTuff("let k = 10; fn addK(a) => a + k; addK(1)")).toEqual({ ok: true, value: 11 });
});

test("interpretTuff rejects a call with the wrong number of arguments", () => {
  expect(interpretTuff("fn f(a) => a; f()").ok).toBe(false);
});

test("interpretTuff rejects a call to an undefined function", () => {
  expect(interpretTuff("g()").ok).toBe(false);
});

test("interpretTuff rejects unbounded recursion", () => {
  expect(interpretTuff("fn f(n) => f(n); f(1)").ok).toBe(false);
});

test("interpretTuff('1 == 2') => 0", () => {
  expect(interpretTuff("1 == 2")).toEqual({ ok: true, value: 0 });
});

test("interpretTuff('let x = 1; x == 1') => 1", () => {
  expect(interpretTuff("let x = 1; x == 1")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff('(1 + 2}') reports the expected closing character", () => {
  const result = interpretTuff("(1 + 2}");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain('Where: line 1, column 7, found "}" where ")" was expected');
});

test("interpretTuff('1 +') reports what, where, why, and the fix", () => {
  const result = interpretTuff("1 +");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain("What: unsupported Tuff source");
  expect(result.error).toContain(
    'Where: line 1, column 4, found end of input where a number, a variable, "(" or "{" was expected',
  );
  expect(result.error).toContain("Why: ");
  expect(result.error).toContain('Fix: change the source to a form such as "1", "1 + 2 * 3", or "(1 + 2) * 3"');
});

test("interpretTuff('(1 + 2') reports the missing closing parenthesis", () => {
  const result = interpretTuff("(1 + 2");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain('Where: line 1, column 7, found end of input where ")" was expected');
});

test("interpretTuff('1 x 2') points at the offending character", () => {
  const result = interpretTuff("1 x 2");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain(
    'Where: line 1, column 3, found "x" where "+", "-", "*", "==" or end of input was expected',
  );
});
