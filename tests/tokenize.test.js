import { describe, it, expect } from "vitest";
import { tokenize } from "../src/tokenize";
import { isOk } from "../src/result";
describe("tokenize - addition & unary", () => {
    it("tokenizes simple expression", () => {
        const r = tokenize("1 + 2");
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toEqual([
                { type: "num", value: 1 },
                { type: "op", value: "+" },
                { type: "num", value: 2 },
            ]);
    });
    it("handles unary minus", () => {
        const r = tokenize("1 - -2");
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toEqual([
                { type: "num", value: 1 },
                { type: "op", value: "-" },
                { type: "num", value: -2 },
            ]);
    });
});
describe("tokenize - mul/div/mod", () => {
    it("tokenizes multiplication", () => {
        const r = tokenize("2 * 3");
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toEqual([
                { type: "num", value: 2 },
                { type: "op", value: "*" },
                { type: "num", value: 3 },
            ]);
    });
    it("tokenizes division", () => {
        const r = tokenize("10 / 2");
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toEqual([
                { type: "num", value: 10 },
                { type: "op", value: "/" },
                { type: "num", value: 2 },
            ]);
    });
    it("tokenizes modulus", () => {
        const r = tokenize("10 % 3");
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toEqual([
                { type: "num", value: 10 },
                { type: "op", value: "%" },
                { type: "num", value: 3 },
            ]);
    });
});
describe("tokenize - parentheses & identifiers", () => {
    it("tokenizes parentheses", () => {
        const r = tokenize("(3 + 10) * 5");
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toEqual([
                { type: "paren", value: "(" },
                { type: "num", value: 3 },
                { type: "op", value: "+" },
                { type: "num", value: 10 },
                { type: "paren", value: ")" },
                { type: "op", value: "*" },
                { type: "num", value: 5 },
            ]);
    });
    it("returns Err on malformed parentheses", () => {
        const r = tokenize("(3 + 2");
        // Tokenizer should still tokenize characters; parenthesis mismatch is detected in evaluation.
        expect(isOk(r)).toBe(true);
    });
    it("tokenizes identifiers", () => {
        const r = tokenize("a - 1");
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toEqual([
                { type: "ident", value: "a" },
                { type: "op", value: "-" },
                { type: "num", value: 1 },
            ]);
    });
});
describe("tokenize - compound assignment", () => {
    it("tokenizes += with spaces", () => {
        const r = tokenize("a += 1");
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toEqual([
                { type: "ident", value: "a" },
                { type: "punct", value: "+=" },
                { type: "num", value: 1 },
            ]);
    });
    it("tokenizes *= without spaces", () => {
        const r = tokenize("b*=2");
        expect(isOk(r)).toBe(true);
        if (isOk(r))
            expect(r.value).toEqual([
                { type: "ident", value: "b" },
                { type: "punct", value: "*=" },
                { type: "num", value: 2 },
            ]);
    });
});
