import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("generic structs", () => {
  itBoth(
    "supports basic generic struct declaration and instantiation",
    (ok) => {
      ok(
        "struct Wrapper<T> { field : T } let value : Wrapper<I32> = Wrapper<I32> { field : 100 }; value.field",
        100,
      );
    },
  );

  itBoth("supports multiple generic type parameters", (ok) => {
    ok(
      "struct Pair<A, B> { first : A, second : B } let p : Pair<I32, I32> = Pair<I32, I32> { first : 10, second : 20 }; p.first",
      10,
    );
  });

  itBoth("supports accessing second generic type parameter field", (ok) => {
    ok(
      "struct Pair<A, B> { first : A, second : B } let p : Pair<I32, I32> = Pair<I32, I32> { first : 10, second : 20 }; p.second",
      20,
    );
  });

  itBoth("supports generic struct with mixed type parameters", (ok) => {
    ok(
      "struct Box<T> { value : T } let b1 : Box<I32> = Box<I32> { value : 42 }; let b2 : Box<I32> = Box<I32> { value : 100 }; b1.value + b2.value",
      142,
    );
  });
});

describe("generic structs - advanced", () => {
  itBoth("supports generic struct in expressions", (ok) => {
    ok(
      "struct Wrapper<T> { field : T } let w : Wrapper<I32> = Wrapper<I32> { field : 50 }; w.field * 2",
      100,
    );
  });

  itBoth("supports nested generic instantiation", (ok) => {
    ok(
      "struct Container<T> { item : T } let c : Container<I32> = Container<I32> { item : (5 + 10) }; c.item",
      15,
    );
  });

  itBoth("supports generic struct with computation in fields", (ok) => {
    ok(
      "struct Calc<T> { value : T } let c : Calc<I32> = Calc<I32> { value : (3 + 4) }; c.value * 2",
      14,
    );
  });

  itBoth("supports generic struct field access in conditional", (ok) => {
    ok(
      "struct Maybe<T> { val : T } let m : Maybe<I32> = Maybe<I32> { val : 10 }; if (m.val > 5) 100 else 0",
      100,
    );
  });
});

describe("generic structs - validation", () => {
  itBoth(
    "throws when field value type mismatches generic type parameter",
    (_, bad) => {
      bad(
        "struct Wrapper<T> { value : T } let value = Wrapper<Bool> { value : 100 };",
      );
    },
  );
});
