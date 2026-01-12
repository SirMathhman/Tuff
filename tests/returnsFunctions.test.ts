import { interpret, type Env, type EnvItem } from "../src/interpret";
import type { FunctionValue } from "../src/interpreter/types";

interface MaybeFunctionValueShape {
  params?: unknown;
  body?: unknown;
  env?: unknown;
}

function isFunctionValue(v: unknown): v is FunctionValue {
  if (typeof v !== "object" || v === null) return false;
  const o = v as MaybeFunctionValueShape;
  return (
    Array.isArray(o.params) &&
    (o.params as unknown[]).every((p) => typeof p === "string") &&
    typeof o.body === "string" &&
    o.env instanceof Map
  );
}

describe("interpret - functions returning functions", () => {
  it("supports returning functions declared as inner fn and returned by name", () => {
    expect(
      interpret(
        "let makeAdder = fn make(n : I32) => { fn add(x : I32) => { x + n }; add }; let add2 = makeAdder(2); add2(3)"
      )
    ).toBe(5);
  });

  it("supports returning arrow functions stored and returned", () => {
    expect(
      interpret(
        "let makeAdder2 = fn make(n : I32) => { let f = (x : I32) => x + n; f }; let add3 = makeAdder2(3); add3(4)"
      )
    ).toBe(7);
  });

  it("inspects returned function closure", () => {
    const env: Env = new Map<string, EnvItem>();
    // execute declaration and ignore result
    interpret(
      "let makeAdder = fn make(n : I32) => { fn add(x : I32) => { x + n }; add }; 0",
      env
    );

    const f = interpret("makeAdder(2)", env);
    expect(isFunctionValue(f)).toBe(true);
    if (!isFunctionValue(f)) throw new Error("Expected a function value");

    expect(f.params).toEqual(["x"]);
    expect(f.env.get("n")?.value).toBe(2);

    env.set("f", { value: f, mutable: false } as EnvItem);
    expect(interpret("f(3)", env)).toBe(5);
  });
});
