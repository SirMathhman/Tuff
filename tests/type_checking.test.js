import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";
describe("type checking with 'is' operator", () => {
    it("checks if value matches type alias (type Temp = I32; let temp : Temp = 100; temp is Temp => 1)", () => {
        expect(interpret("type Temp = I32; let temp : Temp = 100; temp is Temp")).toBe(1);
    });
    it("returns true for matching literal type (100 is I32 => 1)", () => {
        expect(interpret("100 is I32")).toBe(1);
    });
    it("returns false for mismatched type (100U16 is I32 => 0)", () => {
        expect(interpret("100U16 is I32")).toBe(0);
    });
    it("checks type alias against another alias (type Foo = I32; type Bar = I32; 100 is Foo => 1)", () => {
        expect(interpret("type Foo = I32; type Bar = I32; 100 is Foo")).toBe(1);
    });
    it("returns false for incompatible types (100U8 is I32 => 0)", () => {
        expect(interpret("100U8 is I32")).toBe(0);
    });
    it("works with boolean type (let x = true; x is Bool => 1)", () => {
        expect(interpret("let x = true; x is Bool")).toBe(1);
    });
    it("works in expressions (let x = 100I32; if (x is I32) { 42 } => 42)", () => {
        expect(interpret("let x = 100I32; if (x is I32) { 42 }")).toBe(42);
    });
});
