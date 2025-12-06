import { expect, describe, it } from "bun:test";
import interpret from "./interpret";
describe("interpret", () => {
    it('should return "100" when given "100"', () => {
        const result = interpret("100");
        expect(result).toBe("100");
    });
});
