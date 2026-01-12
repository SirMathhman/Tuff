import { interpret } from "../src/interpret";

describe("interpret - borrow checker (pointers) - borrow creation", () => {
  it("allows multiple immutable borrows of a linear binding", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;

      let mut x : L = 5;
      let p1 : *L = &x;
      let p2 : *L = &x;
      let a : I32 = *p1;
      let b : I32 = *p2;
      a + b
    `;

    expect(interpret(program)).toBe(10);
  });

  it("forbids taking &mut while immutable borrows exist", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;

      let mut x : L = 5;
      let p1 : *L = &x;
      let p2 : *mut L = &mut x;
      0
    `;

    expect(() => interpret(program)).toThrow(
      "Cannot take mutable reference while borrow(s) exist"
    );
  });

  it("forbids taking immutable borrow while mutable borrow exists", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;

      let mut x : L = 5;
      let p1 : *mut L = &mut x;
      let p2 : *L = &x;
      0
    `;

    expect(() => interpret(program)).toThrow(
      "Cannot take immutable reference while mutable borrow exists"
    );
  });
});

describe("interpret - borrow checker (pointers) - moves/assign", () => {
  it("forbids moving a linear binding while it is borrowed", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;

      let x : L = 5;
      let p : *L = &x;
      let y = x;
      0
    `;

    expect(() => interpret(program)).toThrow("Cannot move while borrowed");
  });

  it("forbids dropping/moving via call while borrowed", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;

      let x : L = 5;
      let p : *L = &x;
      drop(x);
      0
    `;

    expect(() => interpret(program)).toThrow("Cannot move while borrowed");
  });

  it("forbids reassignment while borrowed", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;

      let mut x : L = 5;
      let p : *L = &x;
      x = 10;
      0
    `;

    expect(() => interpret(program)).toThrow("Cannot assign while borrowed");
  });
});

describe("interpret - borrow checker (pointers) - scope", () => {
  it("releases borrows when the pointer variable leaves scope", () => {
    const program = `
      fn drop(v: I32) => { 0 };
      type L = I32 then drop;

      let x : L = 5;
      { let p : *L = &x; 0 };
      let y = x;
      0
    `;

    expect(interpret(program)).toBe(0);
  });
});
