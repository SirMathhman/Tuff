import { interpret } from "../src/interpret";

describe("interpret - slices from arrays (immutable)", () => {
  it("creates slice from array and reads values", () => {
    expect(
      interpret(
        "let arr : [I32; 3; 3] = [1, 2, 3]; let s : *[I32] = &arr; s[0] + s[2]"
      )
    ).toBe(4);
  });

  it("slice reflects underlying array mutation", () => {
    expect(
      interpret(
        "let mut arr : [I32; 3; 3] = [1, 2, 3]; let s : *[I32] = &arr; arr[1] = 9; s[1]"
      )
    ).toBe(9);
  });

  it("slice .length and .init reflect array", () => {
    expect(
      interpret(
        "let arr : [I32; 3; 3] = [1, 2, 3]; let s : *[I32] = &arr; s.length + s.init"
      )
    ).toBe(6);
  });

  it("cannot assign through slice (immutable)", () => {
    expect(() =>
      interpret(
        "let mut arr : [I32; 3; 3] = [1,2,3]; let s : *[I32] = &arr; s[0] = 10"
      )
    ).toThrow("Cannot assign to slice");
  });

  it("uninitialized read via slice throws", () => {
    expect(() =>
      interpret("let mut arr : [I32; 0; 3]; let s : *[I32] = &arr; s[0]")
    ).toThrow("Index out of bounds or uninitialized");
  });

  it("slice type mismatch throws", () => {
    expect(() =>
      interpret("let mut a : [I32; 3; 3] = [1,2,3]; let s : *[Bool] = &a; s[0]")
    ).toThrow("Slice type mismatch");
  });
});
