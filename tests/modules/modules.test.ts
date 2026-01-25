import { describe, it, expect } from "bun:test";
import { interpret } from "../../src/utils/interpret";

describe("interpret - modules", () => {
  it("supports module declaration with function", () => {
    expect(
      interpret("module Sample { out fn get() => 100; } Sample::get()"),
    ).toBe(100);
  });

  it("supports module with multiple functions", () => {
    expect(
      interpret(
        "module Math { out fn add(a : I32, b : I32) : I32 => a + b; out fn sub(a : I32, b : I32) : I32 => a - b; } Math::add(10, 5)",
      ),
    ).toBe(15);
  });

  it("supports accessing second function from module", () => {
    expect(
      interpret(
        "module Math { out fn add(a : I32, b : I32) : I32 => a + b; out fn sub(a : I32, b : I32) : I32 => a - b; } Math::sub(10, 5)",
      ),
    ).toBe(5);
  });

  it("supports module with variable", () => {
    expect(
      interpret("module Config { out let PI : I32 = 314; } Config::PI"),
    ).toBe(314);
  });

  it("supports module with function accessing module variable", () => {
    expect(
      interpret(
        "module Data { let value : I32 = 42; out fn getValue() => value; } Data::getValue()",
      ),
    ).toBe(42);
  });

  it("throws when accessing non-existent module", () => {
    expect(() => interpret("NonExistent::foo()")).toThrow();
  });

  it("throws when accessing non-existent member in module", () => {
    expect(() =>
      interpret("module Sample { out fn get() => 100; } Sample::missing()"),
    ).toThrow();
  });

  it("supports nested module access in expressions", () => {
    expect(interpret("module M { out fn get() => 50; } M::get() + 50")).toBe(
      100,
    );
  });

  it("supports object singleton with variable access", () => {
    expect(
      interpret("object MySingleton { out let x = 100; } MySingleton.x"),
    ).toBe(100);
  });

  it("supports object singleton with multiple variables", () => {
    expect(
      interpret(
        "object Config { out let mode = 42; out let timeout = 30; } Config.mode",
      ),
    ).toBe(42);
  });

  it("supports object singleton with function", () => {
    expect(
      interpret("object Utils { out fn getValue() => 55; } Utils.getValue()"),
    ).toBe(55);
  });

  it("supports public object member with out keyword", () => {
    expect(
      interpret("object MySingleton { out let x = 100; } MySingleton.x"),
    ).toBe(100);
  });

  it("throws when accessing private object member without out keyword", () => {
    expect(() =>
      interpret("object MySingleton { let x = 100; } MySingleton.x"),
    ).toThrow("member 'x' of object 'MySingleton' is private");
  });

  it("supports public module member with out keyword", () => {
    expect(
      interpret("module Config { out let PORT = 8080; } Config::PORT"),
    ).toBe(8080);
  });

  it("throws when accessing private module member without out keyword", () => {
    expect(() =>
      interpret("module Config { let PORT = 8080; } Config::PORT"),
    ).toThrow("member 'PORT' of module 'Config' is private");
  });

  it("allows accessing private members within same object", () => {
    expect(
      interpret(
        "object Utils { let x = 10; out fn getX() => x; } Utils.getX()",
      ),
    ).toBe(10);
  });

  it("allows accessing private members within same module", () => {
    expect(
      interpret(
        "module Data { let secret = 42; out fn reveal() => secret; } Data::reveal()",
      ),
    ).toBe(42);
  });
});
