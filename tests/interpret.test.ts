import { describe, test, expect } from 'bun:test';
import { interpret } from '../src/interpret';

describe('interpret', () => {
    test('interpret("100") should return 100', () => {
        const result = interpret("100");
        expect(result).toBe(100);
    });
    test('interpret("100U8") should return 100', () => {
        const result = interpret("100U8");
        expect(result).toBe(100);
    });
    test('interpret("-100U8") should throw error', () => {
        expect(() => interpret("-100U8")).toThrow();
    });
    test('interpret("-100I8") should return -100', () => {
        const result = interpret("-100I8");
        expect(result).toBe(-100);
    });
    test('interpret("256U8") should throw error', () => {
        expect(() => interpret("256U8")).toThrow();
    });
    test('interpret("1U8 + 2U8") should return 3', () => {
        const result = interpret("1U8 + 2U8");
        expect(result).toBe(3);
    });
});