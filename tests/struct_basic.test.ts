import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("Tuff Interpreter Structs", () => {
  it("defines and initializes a simple struct", () => {
    // First test: just struct definition
    const code1 = `struct Point { x : I32, y : I32 }`;
    expect(interpret(code1)).toBe(0);
  });

  it("initializes struct", () => {
    const code2 = `struct Point { x : I32, y : I32 }
let myPoint = Point { x : 3, y : 4 };
0`;
    expect(interpret(code2)).toBe(0);
  });

  it("accesses struct member", () => {
    const code3 = `struct Point { x : I32, y : I32 }
let myPoint = Point { x : 3, y : 4 };
myPoint.x`;
    expect(interpret(code3)).toBe(3);
  });

  it("adds struct members", () => {
    const code4 = `struct Point { x : I32, y : I32 }
let myPoint = Point { x : 3, y : 4 };
myPoint.x + myPoint.y`;
    expect(interpret(code4)).toBe(7);
  });
});
