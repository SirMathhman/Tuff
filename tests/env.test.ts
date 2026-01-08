import { describe, it, expect } from "vitest";
import { ensureMapEnv, envClone, envToThisObject } from "../src/env";

describe("env helpers", () => {
  it("ensureMapEnv converts plain object to Map and preserves keys", () => {
    const env = ensureMapEnv({ a: 1, b: 2 });
    expect(env.get("a")).toBe(1);
    expect(env.get("b")).toBe(2);
  });

  it("envClone copies entries without preserving identity", () => {
    const env = ensureMapEnv({ x: 10 });
    const c = envClone(env);
    expect(c.get("x")).toBe(10);
    c.set("x", 20);
    expect(env.get("x")).toBe(10);
  });

  it("envToThisObject excludes __* keys and returns plain object", () => {
    const env = ensureMapEnv({ x: 1, __private: 2, this: 3 });
    const o = envToThisObject(env);
    expect(o.x).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(o, "__private")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(o, "this")).toBe(false);
  });
});
