import { describe, it, expect } from "bun:test";
import { interpret } from "../src/utils/interpret";

describe("interpret - modules", () => {
  it("supports module declaration with function", () => {
    expect(interpret("module Sample { fn get() => 100; } Sample::get()")).toBe(
      100,
    );
  });

  it("supports module with multiple functions", () => {
    expect(
      interpret(
        "module Math { fn add(a : I32, b : I32) : I32 => a + b; fn sub(a : I32, b : I32) : I32 => a - b; } Math::add(10, 5)",
      ),
    ).toBe(15);
  });

  it("supports accessing second function from module", () => {
    expect(
      interpret(
        "module Math { fn add(a : I32, b : I32) : I32 => a + b; fn sub(a : I32, b : I32) : I32 => a - b; } Math::sub(10, 5)",
      ),
    ).toBe(5);
  });

  it("supports module with variable", () => {
    expect(interpret("module Config { let PI : I32 = 314; } Config::PI")).toBe(
      314,
    );
  });

  it("supports module with function accessing module variable", () => {
    expect(
      interpret(
        "module Data { let value : I32 = 42; fn getValue() => value; } Data::getValue()",
      ),
    ).toBe(42);
  });

  it("throws when accessing non-existent module", () => {
    expect(() => interpret("NonExistent::foo()")).toThrow();
  });

  it("throws when accessing non-existent member in module", () => {
    expect(() =>
      interpret("module Sample { fn get() => 100; } Sample::missing()"),
    ).toThrow();
  });

  it("supports nested module access in expressions", () => {
    expect(interpret("module M { fn get() => 50; } M::get() + 50")).toBe(100);
  });
});
