import { describe, it, expect } from "vitest";
import { interpret } from "../main/ts/interpret";

describe("union types", () => {
  it("defines and uses union type (type MyUnion = I32 | Bool; let temp : MyUnion = 100; temp is MyUnion => 1)", () => {
    expect(
      interpret(
        "type MyUnion = I32 | Bool; let temp : MyUnion = 100; temp is MyUnion"
      )
    ).toBe(1);
  });

  it("checks value against union with first type matching", () => {
    expect(
      interpret("type IntOrBool = I32 | Bool; let x = 42I32; x is IntOrBool")
    ).toBe(1);
  });

  it("checks value against union with second type matching", () => {
    expect(
      interpret("type IntOrBool = I32 | Bool; let x = true; x is IntOrBool")
    ).toBe(1);
  });

  it("rejects value not matching any union type", () => {
    expect(
      interpret("type IntOrBool = I32 | Bool; let x = 100U8; x is IntOrBool")
    ).toBe(0);
  });

  it("stores union type in variable declaration", () => {
    expect(
      interpret(
        "type Result = I32 | Bool; let value : Result = 123; value is I32"
      )
    ).toBe(1);
  });

  it("supports three-way union", () => {
    expect(
      interpret("type Triple = I32 | Bool | U8; let x = 200U8; x is Triple")
    ).toBe(1);
  });

  it("type checks union assignment compatibility", () => {
    expect(() =>
      interpret("type MyUnion = I32 | Bool; let x : MyUnion = 100U16;")
    ).toThrow();
  });

  it("union type with type alias member", () => {
    expect(
      interpret(
        "type MyI32 = I32; type MyUnion = MyI32 | Bool; let x = 100I32; x is MyUnion"
      )
    ).toBe(1);
  });
});
