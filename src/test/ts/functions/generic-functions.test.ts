import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("generic functions", () => {
  itBoth("supports basic generic function with value parameter", (ok) => {
    ok("fn pass<T>(value : T) => value; pass(100)", 100);
  });

  itBoth("supports generic function with multiple type parameters", (ok) => {
    ok(
      "fn identity<A>(x : A) => x; fn second<B, C>(a : B, b : C) => b; second(1, 2)",
      2,
    );
  });

  itBoth("supports generic function returning first parameter", (ok) => {
    ok("fn first<A, B>(a : A, b : B) => a; first(100, 200)", 100);
  });

  itBoth("supports generic function with operations on generic type", (ok) => {
    ok("fn double<T>(x : T) => x + x; double(50)", 100);
  });

  itBoth("supports generic function in expressions", (ok) => {
    ok("fn identity<T>(x : T) => x; identity(50) * 2", 100);
  });

  itBoth("supports named calls to generic functions", (ok) => {
    ok("fn swap<A, B>(a : A, b : B) => b; swap(1, 2)", 2);
  });

  itBoth("supports generic function with computation", (ok) => {
    ok("fn increment<T>(x : T) => x + 1; increment(99)", 100);
  });

  itBoth("supports multiple generic function definitions", (ok) => {
    ok("fn id1<T>(x : T) => x; fn id2<U>(y : U) => y + 1; id2(49)", 50);
  });

  itBoth(
    "throws when generic function called with mismatched types for same parameter",
    (_, assertInvalid) => {
      assertInvalid(
        "fn pass<T>(first : T, second : T) => first; pass(100, true)",
      );
    },
  );
});
