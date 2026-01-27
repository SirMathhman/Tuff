import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("union types - with generic structs/objects", () => {
  itBoth(
    "supports generic struct/object union with type checking",
    (assertValid) => {
      assertValid(
        "struct Some<T> { value : T } object None<T> {} type Option<T> = Some<T> | None<T>; let value : Option<I32> = Some<I32> { value : 100 }; value is Some<I32>",
        1,
      );
    },
  );

  itBoth(
    "supports union type checking against base types in union",
    (assertValid) => {
      assertValid(
        "struct Some<T> { value : T } object None<T> {} type Option<T> = Some<T> | None<T>; let value : Option<I32> = Some<I32> { value : 100 }; value is Option<I32>",
        1,
      );
    },
  );

  itBoth(
    "supports union values and extracting from union type",
    (assertValid) => {
      assertValid(
        "struct Some<T> { value : T } object None<T> {} type Option<T> = Some<T> | None<T>; let value : Option<I32> = Some<I32> { value : 42 }; if (value is Some<I32>) { value.value } else { 0 }",
        42,
      );
    },
  );
});
