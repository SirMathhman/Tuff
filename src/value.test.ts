import { describe, expect, test } from "bun:test";
import { resolveRefChain } from "./value.ts";
import type { Binding } from "./value.ts";

function numBinding(value: number): Binding {
  return { value: { kind: "number", value }, mutable: false };
}

function refBinding(target: string, mutable = false): Binding {
  return { value: { kind: "ref", target, mutable }, mutable: false };
}

describe("resolveRefChain", () => {
  test("non-reference binding resolves to itself", () => {
    const env = new Map<string, Binding>([["x", numBinding(5)]]);
    const r = resolveRefChain("x", (n) => env.get(n));
    expect(r).not.toBeNull();
    if (r) {
      expect(r.name).toBe("x");
      expect(r.binding.value).toEqual({ kind: "number", value: 5 });
    }
  });

  test("single reference resolves to its target", () => {
    const env = new Map<string, Binding>([
      ["y", refBinding("x")],
      ["x", numBinding(7)],
    ]);
    const r = resolveRefChain("y", (n) => env.get(n));
    expect(r).not.toBeNull();
    if (r) {
      expect(r.name).toBe("x");
      expect(r.binding.value).toEqual({ kind: "number", value: 7 });
    }
  });

  test("chained references resolve to the end of the chain", () => {
    const env = new Map<string, Binding>([
      ["a", refBinding("b")],
      ["b", refBinding("c")],
      ["c", numBinding(3)],
    ]);
    const r = resolveRefChain("a", (n) => env.get(n));
    expect(r).not.toBeNull();
    if (r) {
      expect(r.name).toBe("c");
      expect(r.binding.value).toEqual({ kind: "number", value: 3 });
    }
  });

  test("reference cycle returns null", () => {
    const env = new Map<string, Binding>([
      ["a", refBinding("b")],
      ["b", refBinding("a")],
    ]);
    expect(resolveRefChain("a", (n) => env.get(n))).toBeNull();
  });

  test("self-reference returns null", () => {
    const env = new Map<string, Binding>([["x", refBinding("x")]]);
    expect(resolveRefChain("x", (n) => env.get(n))).toBeNull();
  });

  test("missing reference target returns null", () => {
    const env = new Map<string, Binding>([["y", refBinding("missing")]]);
    expect(resolveRefChain("y", (n) => env.get(n))).toBeNull();
  });

  test("missing starting name returns null", () => {
    expect(resolveRefChain("nope", () => undefined)).toBeNull();
  });
});
