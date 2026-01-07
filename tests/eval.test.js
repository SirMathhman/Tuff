import { describe, it, expect } from "vitest";
import { evalLeftToRight } from "../src/evalLeftToRight";
import { isOk, isErr } from "../src/result";
describe("evalLeftToRight - addition/subtraction", () => {
    it("evaluates left-to-right", () => {
        const tokens = [
            { type: "num", value: 10 },
            { type: "op", value: "-" },
            { type: "num", value: 5 },
            { type: "op", value: "+" },
            { type: "num", value: 3 },
        ];
        const r = evalLeftToRight(tokens);
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toBe(8);
    });
});
describe("evalLeftToRight - multiplication", () => {
    it("evaluates multiplication with precedence", () => {
        const tokens = [
            { type: "num", value: 10 },
            { type: "op", value: "*" },
            { type: "num", value: 5 },
            { type: "op", value: "+" },
            { type: "num", value: 3 },
        ];
        const r = evalLeftToRight(tokens);
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toBe(53);
    });
    it("evaluates chained multiplication", () => {
        const tokens = [
            { type: "num", value: 2 },
            { type: "op", value: "*" },
            { type: "num", value: 3 },
            { type: "op", value: "*" },
            { type: "num", value: 4 },
        ];
        const r = evalLeftToRight(tokens);
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toBe(24);
    });
});
describe("evalLeftToRight - division & modulus", () => {
    it("evaluates division and chained division", () => {
        const tokens = [
            { type: "num", value: 100 },
            { type: "op", value: "/" },
            { type: "num", value: 2 },
            { type: "op", value: "/" },
            { type: "num", value: 5 },
        ];
        const r = evalLeftToRight(tokens);
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toBe(10);
        const r2 = evalLeftToRight([
            { type: "num", value: 20 },
            { type: "op", value: "/" },
            { type: "num", value: 5 },
        ]);
        expect(isOk(r2)).toBe(true);
        if (isOk(r2))
            expect(r2.value).toBe(4);
    });
    it("evaluates modulus and chained modulus", () => {
        const tokens = [
            { type: "num", value: 10 },
            { type: "op", value: "%" },
            { type: "num", value: 3 },
        ];
        const r = evalLeftToRight(tokens);
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toBe(1);
        const tokens2 = [
            { type: "num", value: 20 },
            { type: "op", value: "%" },
            { type: "num", value: 6 },
            { type: "op", value: "%" },
            { type: "num", value: 4 },
        ];
        const r2 = evalLeftToRight(tokens2);
        expect(isOk(r2)).toBe(true);
        if (isOk(r2))
            expect(r2.value).toBe(2);
    });
});
describe("evalLeftToRight - parentheses", () => {
    it("evaluates parentheses grouping", () => {
        const tokens = [
            { type: "paren", value: "(" },
            { type: "num", value: 3 },
            { type: "op", value: "+" },
            { type: "num", value: 10 },
            { type: "paren", value: ")" },
            { type: "op", value: "*" },
            { type: "num", value: 5 },
        ];
        const r = evalLeftToRight(tokens);
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toBe(65);
    });
    it("evaluates nested parentheses", () => {
        const tokens = [
            { type: "num", value: 2 },
            { type: "op", value: "*" },
            { type: "paren", value: "(" },
            { type: "num", value: 1 },
            { type: "op", value: "+" },
            { type: "paren", value: "(" },
            { type: "num", value: 3 },
            { type: "op", value: "-" },
            { type: "num", value: 1 },
            { type: "paren", value: ")" },
            { type: "paren", value: ")" },
        ];
        const r = evalLeftToRight(tokens);
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toBe(6);
    });
});
describe("evalLeftToRight - errors", () => {
    it("returns Err on invalid token sequence", () => {
        const r = evalLeftToRight([{ type: "op", value: "+" }]);
        expect(isErr(r)).toBe(true);
    });
    it("returns Err on empty parentheses", () => {
        const tokens = [
            { type: "paren", value: "(" },
            { type: "paren", value: ")" },
        ];
        const r = evalLeftToRight(tokens);
        expect(isErr(r)).toBe(true);
    });
    it("returns Err on unmatched opening parenthesis", () => {
        const tokens = [
            { type: "paren", value: "(" },
            { type: "num", value: 1 },
        ];
        const r = evalLeftToRight(tokens);
        expect(isErr(r)).toBe(true);
    });
});
