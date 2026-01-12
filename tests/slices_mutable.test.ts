/* eslint-disable max-lines-per-function */
import { interpret } from "../src/interpret";

describe("interpret - mutable slices", () => {
  it("supports writing through mutable slice and updates init", () => {
    expect(
      interpret(
        "let mut arr : [I32; 0; 3]; let s : *mut [I32] = &mut arr; s[0] = 10; s[0] + arr.init"
      )
    ).toBe(11);
  });

  it("sequential init enforced via slice", () => {
    expect(
      interpret(
        "let mut arr : [I32; 0; 3]; let s : *mut [I32] = &mut arr; s[0] = 1; s[1] = 2; arr.init"
      )
    ).toBe(2);
  });

  it("out-of-order init via slice throws", () => {
    expect(() =>
      interpret(
        "let mut arr : [I32; 0; 3]; let s : *mut [I32] = &mut arr; s[1] = 2"
      )
    ).toThrow("Out-of-order initialization");
  });

  it("cannot take &mut of immutable array and cannot write through immutable slice", () => {
    expect(() =>
      interpret(
        "let arr : [I32; 3; 3] = [1,2,3]; let s : *mut [I32] = &mut arr; 0"
      )
    ).toThrow("Cannot take mutable reference to immutable variable");

    expect(() =>
      interpret(
        "let mut arr : [I32; 3; 3] = [1,2,3]; let s : *[I32] = &arr; s[0] = 5"
      )
    ).toThrow("Cannot assign to slice");
  });

  it("borrow conflict: cannot take &mut while immutable slices exist", () => {
    expect(() =>
      interpret(
        "let mut arr : [I32; 3; 3] = [1,2,3]; let s1 : *[I32] = &arr; let s2 : *mut [I32] = &mut arr; 0"
      )
    ).toThrow("Cannot take mutable reference while borrow(s) exist");
  });

  it("multiple immutable slices allowed", () => {
    expect(
      interpret(
        "let arr : [I32; 3; 3] = [1,2,3]; let s1 : *[I32] = &arr; let s2 : *[I32] = &arr; s1[1] + s2[2]"
      )
    ).toBe(5);
  });

  it("bounds and uninitialized checks via mutable slice", () => {
    expect(() =>
      interpret(
        "let mut arr : [I32; 0; 3]; let s : *mut [I32] = &mut arr; s[3] = 10"
      )
    ).toThrow("Index out of bounds");

    expect(() =>
      interpret(
        "let mut arr : [I32; 0; 3]; let s : *mut [I32] = &mut arr; s[0]"
      )
    ).toThrow("Index out of bounds or uninitialized");
  });

  it("pointer vs slice annotation behavior", () => {
    expect(
      interpret(
        "let mut arr : [I32; 0; 3]; let p : *mut [I32] = &mut arr; p[0] = 7; p[0]"
      )
    ).toBe(7);

    expect(
      interpret(
        "let mut arr : [I32; 3; 3] = [1,2,3]; let s : *[I32] = &mut arr; s[0]"
      )
    ).toBe(1);

    expect(() =>
      interpret(
        "let mut arr : [I32; 3; 3] = [1,2,3]; let s : *[I32] = &mut arr; s[0] = 9"
      )
    ).toThrow("Cannot assign to slice");
  });

  it("cannot reassign array while slices exist", () => {
    expect(() =>
      interpret(
        "let mut arr : [I32; 3; 3] = [1,2,3]; let s : *[I32] = &arr; arr = [4,5,6]"
      )
    ).toThrow("Cannot reassign array while slices exist");

    expect(
      interpret("let mut arr : [I32; 3; 3] = [1,2,3]; arr = [4,5,6]; arr[0]")
    ).toBe(4);
  });

  it("mut slice passed to function can mutate backing array", () => {
    expect(
      interpret(
        "fn mutate(s : *mut [I32]) => { s[0] = 9 }; let mut arr : [I32; 0; 1]; let s : *mut [I32] = &mut arr; mutate(s); s[0]"
      )
    ).toBe(9);
  });
});
