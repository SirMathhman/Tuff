import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";
describe("Tuff Interpreter Struct Literals", () => {
    it("creates and accesses struct literal", () => {
        const code = `struct Point { x : I32, y : I32 } Point { x : 3, y : 4 }.x`;
        expect(interpret(code)).toBe(3);
    });
    it("accesses second member of struct literal", () => {
        const code = `struct Point { x : I32, y : I32 } Point { x : 3, y : 4 }.y`;
        expect(interpret(code)).toBe(4);
    });
    it("performs arithmetic on struct literal member", () => {
        const code = `struct Point { x : I32, y : I32 } Point { x : 3, y : 4 }.x + Point { x : 5, y : 6 }.y`;
        expect(interpret(code)).toBe(9);
    });
});
