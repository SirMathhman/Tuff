import { interpret } from "../src/interpret";

describe("interpret - linear types with pointers", () => {
  it("can take address-of a linear binding and read through pointer", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;

      let mut x : L = 7;
      let p : *L = &x;
      *p
    `;

    expect(interpret(program)).toBe(7);
  });

  it("deref through pointer after move throws use-after-move", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;

      let mut x : L = 9;
      let p : *L = &x;
      drop(x);
      *p
    `;

    expect(() => interpret(program)).toThrow("Use-after-move");
  });

  it("cannot take address-of a moved linear binding", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;

      let x : L = 1;
      drop(x);
      let p : *L = &x;
      0
    `;

    expect(() => interpret(program)).toThrow("Use-after-move");
  });

  it("cannot assign through pointer to a moved linear binding", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;

      let mut x : L = 1;
      let p : *mut L = &mut x;
      drop(x);
      *p = 2;
      0
    `;

    expect(() => interpret(program)).toThrow("Use-after-move");
  });
});
