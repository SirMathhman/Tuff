import { describe, it, expect } from "vitest";
import { interpret } from "../main/ts/interpret";

describe("type aliases", () => {
  it("defines and uses simple type alias (type Temp = I32; let temp : Temp = 100; temp)", () => {
    expect(interpret("type Temp = I32; let temp : Temp = 100; temp")).toBe(100);
  });

  it("uses type alias in multiple variable declarations", () => {
    expect(
      interpret(
        "type Score = U8; let x : Score = 10; let y : Score = 20; x + y"
      )
    ).toBe(30);
  });

  it("throws on invalid assignment (type Temp = I32; let temp : Temp = 100; let value : Bool = temp)", () => {
    expect(() =>
      interpret(
        "type Temp = I32; let temp : Temp = 100; let value : Bool = temp;"
      )
    ).toThrow();
  });

  it("throws on incompatible type alias assignment", () => {
    expect(() => interpret("type MyU8 = U8; let x : MyU8 = 100U16;")).toThrow();
  });

  it("supports type alias with assignment to compatible value", () => {
    expect(
      interpret("type Count = I32; let x : Count = 10; let y : I32 = x; y")
    ).toBe(10);
  });
});
