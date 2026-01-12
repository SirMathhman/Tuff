import { interpret } from "../src/interpret";

describe("interpret - linear types (scope drop)", () => {
  it("parses `type T = Base then destructor` and auto-drops at scope exit", () => {
    const program = `
      let mut sum : I32 = 0;
      fn drop(v: I32) => { sum = sum + v; };
      type L = I32 then drop;
      { let x : L = 5; 0 };
      sum
    `;

    expect(interpret(program)).toBe(5);
  });

  it("does not drop on move; new owner drops at end of scope", () => {
    const program = `
      let mut dropped : I32 = 0;
      fn drop(v: I32) => { dropped = v; };
      type L = I32 then drop;
      {
        let x : L = 50;
        let y = x;
        dropped = 1;
        0
      };
      dropped
    `;

    expect(interpret(program)).toBe(50);
  });

  it("drops old value on reassignment and drops final value at scope exit", () => {
    const program = `
      let mut sum : I32 = 0;
      fn drop(v: I32) => { sum = sum + v; };
      type L = I32 then drop;
      {
        let mut x : L = 100;
        x = 200;
        0
      };
      sum
    `;

    expect(interpret(program)).toBe(300);
  });
});

describe("interpret - linear types (moves)", () => {
  it("moves ownership on `let y = x` and forbids use-after-move", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;
      let x : L = 10;
      let y = x;
      x
    `;

    expect(() => interpret(program)).toThrow("Use-after-move");
  });

  it("moves ownership when passed as a call argument (no double-drop)", () => {
    const program = `
      let mut count : I32 = 0;
      fn drop(v: I32) => { count = count + 1; };
      type L = I32 then drop;
      {
        let x : L = 10;
        drop(x);
        0
      };
      count
    `;

    expect(interpret(program)).toBe(1);
  });
});
