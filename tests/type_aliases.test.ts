import { interpret } from "../src/interpret";

describe("interpret - type aliases", () => {
  it("supports simple alias for integer types", () => {
    expect(interpret("type MyType = I32; let x : MyType = 5; x")).toBe(5);
  });

  it("supports alias-of-alias", () => {
    expect(
      interpret("type T1 = I32; type T2 = T1; let x : T2 = 4; x")
    ).toBe(4);
  });

  it("supports alias for arrays", () => {
    expect(
      interpret("type Arr = [I32; 3; 3]; let a : Arr = [1,2,3]; a[2]")
    ).toBe(3);
  });

  it("supports alias for pointer types", () => {
    expect(
      interpret("type P = *I32; let mut v : I32 = 9; let p : P = &v; *p")
    ).toBe(9);
  });

  it("type aliases are block-scoped", () => {
    expect(() =>
      interpret("{ type Inner = I32; let x : Inner = 1; 0 }; let y : Inner = 2; 0")
    ).toThrow("Unknown type: Inner");
  });
});