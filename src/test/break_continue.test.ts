import { describe, it, expect } from "vitest";
import { interpret } from "../main/ts/interpret";

describe("break statement", () => {
  it("should exit loop when break is encountered", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..10) { if(i == 5) break; sum += i }; sum"
      )
    ).toBe(10); // 0+1+2+3+4 = 10
  });

  it("should break from while loop", () => {
    expect(
      interpret(
        "let mut i = 0; let mut sum = 0; while(i < 10) { if(i == 3) break; sum += i; i += 1 }; sum"
      )
    ).toBe(3); // 0+1+2 = 3
  });

  it("should break from do-while loop", () => {
    expect(
      interpret(
        "let mut i = 0; let mut sum = 0; do { if(i == 2) break; sum += i; i += 1 } while(i < 10); sum"
      )
    ).toBe(1); // 0+1 = 1
  });

  it("should break at first iteration", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..10) { break; sum += i }; sum"
      )
    ).toBe(0);
  });

  it("should break in nested loops (breaks inner loop only)", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..3) { for(let mut j in 0..3) { if(j == 1) break; sum += 1 } }; sum"
      )
    ).toBe(3); // outer: 3 iterations, inner: 1 iteration each = 3
  });

  it("should break with multiple conditions", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..20) { if(i > 5 && i < 10) break; sum += 1 }; sum"
      )
    ).toBe(6); // 0-5 then break at 6
  });
});

describe("continue statement - basics", () => {
  it("should skip to next iteration", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..10) { if(i % 2 == 0) continue; sum += i }; sum"
      )
    ).toBe(25); // 1+3+5+7+9 = 25
  });

  it("should skip multiple iterations", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..10) { if(i < 5) continue; sum += i }; sum"
      )
    ).toBe(35); // 5+6+7+8+9 = 35
  });

  it("should work in while loop", () => {
    expect(
      interpret(
        "let mut i = 0; let mut sum = 0; while(i < 10) { i += 1; if(i % 2 == 0) continue; sum += i }; sum"
      )
    ).toBe(25); // 1+3+5+7+9 = 25
  });

  it("should work in do-while loop", () => {
    expect(
      interpret(
        "let mut i = 0; let mut sum = 0; do { i += 1; if(i % 2 == 0) continue; sum += i } while(i < 10); sum"
      )
    ).toBe(25); // 1+3+5+7+9 = 25
  });
});

describe("continue statement - advanced", () => {
  it("should continue in nested loops (continues inner loop only)", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..3) { for(let mut j in 0..3) { if(j == 1) continue; sum += 1 } }; sum"
      )
    ).toBe(6); // outer: 3 iterations, inner: 2 iterations each = 6
  });

  it("should work with multiple continues", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..10) { if(i < 2) continue; if(i > 7) continue; sum += i }; sum"
      )
    ).toBe(27); // 2+3+4+5+6+7 = 27
  });

  it("should continue at first iteration", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..5) { if(i == 0) continue; sum += i }; sum"
      )
    ).toBe(10); // 1+2+3+4 = 10
  });

  it("should skip last iteration with continue", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..5) { if(i == 4) continue; sum += i }; sum"
      )
    ).toBe(6); // 0+1+2+3 = 6
  });
});

describe("break and continue together", () => {
  it("should handle both in same loop", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..20) { if(i < 3) continue; if(i >= 8) break; sum += i }; sum"
      )
    ).toBe(25); // 3+4+5+6+7 = 25
  });

  it("should continue before break condition", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..10) { if(i % 2 == 1) continue; if(i == 6) break; sum += i }; sum"
      )
    ).toBe(6); // 0+2+4 = 6
  });

  it("should break before continue is checked", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..10) { if(i == 5) break; if(i % 2 == 1) continue; sum += i }; sum"
      )
    ).toBe(6); // 0+2+4 = 6
  });
});

describe("break and continue edge cases", () => {
  it("should not affect outer loop from inner break", () => {
    expect(
      interpret(
        "let mut outer = 0; for(let mut i in 0..3) { let mut inner = 0; for(let mut j in 0..3) { if(j == 1) break; inner += 1 }; outer += inner }; outer"
      )
    ).toBe(3); // each iteration: 1 + 1 + 1
  });

  it("should not affect outer loop from inner continue", () => {
    expect(
      interpret(
        "let mut result = 0; for(let mut i in 0..3) { result += 1; for(let mut j in 0..3) { if(j == 1) continue; result += 1 } }; result"
      )
    ).toBe(9); // 3 outer increments + (3 * 2) inner increments = 3 + 6 = 9
  });

  it("should work with complex nested conditions", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..5) { if(i == 2) { if(true) continue } sum += 1 }; sum"
      )
    ).toBe(4); // all except i=2
  });
});
