describe("Sample test", () => {
  it("should pass a simple assertion", () => {
    expect(1 + 1).toBe(2);
  });

  it("should test a TypeScript function", () => {
    const add = (a: number, b: number): number => {
      return a + b;
    };
    expect(add(2, 3)).toBe(5);
  });
});
