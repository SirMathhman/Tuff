import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("empty/whitespace input", () => {
    test('interpret("") => 0', () => {
        expect(interpret("")).toBe(0);
    });

    test('interpret(" ") => 0', () => {
        expect(interpret(" ")).toBe(0);
    });
});

describe("number literals", () => {
    test('interpret("1") => 1', () => {
        expect(interpret("1")).toBe(1);
    });
});

describe("binary expressions", () => {
    test('interpret("1 + 2") => 3', () => {
        expect(interpret("1 + 2")).toBe(3);
    });
});

