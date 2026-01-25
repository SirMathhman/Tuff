import { describe, it } from "bun:test";
import { assertInterpretValid, assertInterpretInvalid } from "../test-helpers";

describe("interpret - modules - declarations", () => {
  it("supports module declaration with function", () => {
    assertInterpretValid(
      "module Sample { out fn get() => 100; } Sample::get()",
      100,
    );
  });

  it("supports module with multiple functions", () => {
    assertInterpretValid(
      "module Math { out fn add(a : I32, b : I32) : I32 => a + b; out fn sub(a : I32, b : I32) : I32 => a - b; } Math::add(10, 5)",
      15,
    );
  });

  it("supports accessing second function from module", () => {
    assertInterpretValid(
      "module Math { out fn add(a : I32, b : I32) : I32 => a + b; out fn sub(a : I32, b : I32) : I32 => a - b; } Math::sub(10, 5)",
      5,
    );
  });

  it("supports module with variable", () => {
    assertInterpretValid(
      "module Config { out let PI : I32 = 314; } Config::PI",
      314,
    );
  });

  it("supports module with function accessing module variable", () => {
    assertInterpretValid(
      "module Data { let value : I32 = 42; out fn getValue() => value; } Data::getValue()",
      42,
    );
  });

  it("supports nested module access in expressions", () => {
    assertInterpretValid("module M { out fn get() => 50; } M::get() + 50", 100);
  });
});

describe("interpret - modules - error handling", () => {
  it("throws when accessing non-existent module", () => {
    assertInterpretInvalid("NonExistent::foo()");
  });

  it("throws when accessing non-existent member in module", () => {
    assertInterpretInvalid(
      "module Sample { out fn get() => 100; } Sample::missing()",
    );
  });
});

describe("interpret - modules - objects", () => {
  it("supports object singleton with variable access", () => {
    assertInterpretValid(
      "object MySingleton { out let x = 100; } MySingleton.x",
      100,
    );
  });

  it("supports object singleton with multiple variables", () => {
    assertInterpretValid(
      "object Config { out let mode = 42; out let timeout = 30; } Config.mode",
      42,
    );
  });

  it("supports object singleton with function", () => {
    assertInterpretValid(
      "object Utils { out fn getValue() => 55; } Utils.getValue()",
      55,
    );
  });

  it("supports public object member with out keyword", () => {
    assertInterpretValid(
      "object MySingleton { out let x = 100; } MySingleton.x",
      100,
    );
  });
});

describe("interpret - modules - visibility", () => {
  it("throws when accessing private object member without out keyword", () => {
    assertInterpretInvalid("object MySingleton { let x = 100; } MySingleton.x");
  });

  it("supports public module member with out keyword", () => {
    assertInterpretValid(
      "module Config { out let PORT = 8080; } Config::PORT",
      8080,
    );
  });

  it("throws when accessing private module member without out keyword", () => {
    assertInterpretInvalid("module Config { let PORT = 8080; } Config::PORT");
  });

  it("allows accessing private members within same object", () => {
    assertInterpretValid(
      "object Utils { let x = 10; out fn getX() => x; } Utils.getX()",
      10,
    );
  });

  it("allows accessing private members within same module", () => {
    assertInterpretValid(
      "module Data { let secret = 42; out fn reveal() => secret; } Data::reveal()",
      42,
    );
  });
});
