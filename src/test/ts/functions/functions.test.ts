import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("functions - declarations", () => {
  itBoth("supports function declaration and calls", (assertValid) => {
    assertValid(
      "fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)",
      7,
    );
  });

  itBoth(
    "supports function references and calls through variables",
    (assertValid) => {
      assertValid(
        "fn get() : I32 => 100; let func : () => I32 = get; func()",
        100,
      );
    },
  );

  itBoth(
    "supports forward function references - function calling function declared later",
    (assertValid) => {
      assertValid("fn get0() => get1(); fn get1() => 100; get0()", 100);
    },
  );

  itBoth(
    "function declaration as expression evaluates to zero",
    (assertValid) => {
      assertValid("fn get() => 100;", 0);
    },
  );

  itBoth(
    "throws on duplicate parameter names",
    (assertValid, assertInvalid) => {
      assertInvalid("fn doNothing(first : I32, first : I32) => {}");
    },
  );

  itBoth(
    "throws when function name conflicts with variable name",
    (assertValid, assertInvalid) => {
      assertInvalid("let empty = 0; fn empty() => {}");
    },
  );

  itBoth(
    "throws when function parameter shadows variable name",
    (assertValid, assertInvalid) => {
      assertInvalid("let temp = 0; fn pass(temp : I32) => temp;");
    },
  );
});

describe("functions - lambdas", () => {
  itBoth(
    "supports anonymous functions and lambda expressions",
    (assertValid) => {
      assertValid("let func : () => I32 = () : I32 => 100; func()", 100);
    },
  );

  itBoth(
    "supports lambda expressions without type annotations",
    (assertValid) => {
      assertValid("let func : () => I32 = () => 100; func()", 100);
    },
  );

  itBoth("supports function parameters with function types", (assertValid) => {
    assertValid(
      "fn perform(action : (I32, I32) => I32) => action(3, 4); perform((first : I32, second : I32) => first + second)",
      7,
    );
  });
});

describe("functions - scope and methods", () => {
  itBoth(
    "supports function scope closure with mutable outer variable",
    (assertValid) => {
      assertValid("let mut x = 0; fn add() => x += 1; add(); x", 1);
    },
  );

  itBoth(
    "supports function scope closure with explicit Void return type",
    (assertValid) => {
      assertValid("let mut x = 0; fn add() : Void => x += 1; add(); x", 1);
    },
  );

  itBoth(
    "supports method call syntax with receiver as this parameter",
    (assertValid) => {
      assertValid(
        "fn add(this : I32, argument : I32) => this + argument; 100.add(50)",
        150,
      );
    },
  );

  itBoth("supports chained method calls", (assertValid) => {
    assertValid(
      "fn add(this : I32, argument : I32) => this + argument; 100.add(10).add(20)",
      130,
    );
  });
});

describe("functions - type validation", () => {
  itBoth(
    "throws when passing wrong type to function parameter",
    (assertValid, assertInvalid) => {
      assertInvalid("fn performNot(value : Bool) => !value; performNot(100)");
    },
  );
});
