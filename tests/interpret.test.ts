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
    test('interpret("1 + 2") should return 3', () => {
        const result = interpret("1 + 2");
        expect(result).toBe(3);
    });
    test('interpret("1U8 + 255U8") should throw error', () => {
        expect(() => interpret("1U8 + 255U8")).toThrow();
    });
    test('interpret("1U8 + 255") should throw error', () => {
        expect(() => interpret("1U8 + 255")).toThrow();
    });
    test('interpret("1U8 + 255U16") should return 256', () => {
        const result = interpret("1U8 + 255U16");
        expect(result).toBe(256);
    });
    test('interpret("1U8 + 65535U16") should throw error', () => {
        expect(() => interpret("1U8 + 65535U16")).toThrow();
    });
    test('interpret("1U8 + 2U16 + 3U32") should return 6', () => {
        const result = interpret("1U8 + 2U16 + 3U32");
        expect(result).toBe(6);
    });
    test('interpret("2 + 3 - 4I8") should return 1', () => {
        const result = interpret("2 + 3 - 4I8");
        expect(result).toBe(1);
    });
});