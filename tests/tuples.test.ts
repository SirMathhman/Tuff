import { interpret } from '../src/interpret';

describe('Tuples - Basic Operations', (): void => {
	test('should parse simple tuple type and literal', (): void => {
		const result = interpret('let x : (I32, I32) = (3, 4); x');
		expect(result).toEqual({ type: 'ok', value: 0 });
	});

	test('should access tuple elements by index', (): void => {
		const result = interpret('let x : (I32, I32) = (3, 4); x[0] + x[1]');
		expect(result).toEqual({ type: 'ok', value: 7 });
	});

	test('should support mixed types in tuples', (): void => {
		const result = interpret('let x : (I32, U8, I32) = (10, 5, 3); x[0] + x[2]');
		expect(result).toEqual({ type: 'ok', value: 13 });
	});

	test('should allow complex expressions in tuple literals', (): void => {
		const result = interpret('let x : (I32, I32) = (1 + 2, 3 + 4); x[0] + x[1]');
		expect(result).toEqual({ type: 'ok', value: 10 });
	});

	test('should support three element tuples', (): void => {
		const result = interpret('let x : (I32, I32, I32) = (1, 2, 3); x[0] + x[1] + x[2]');
		expect(result).toEqual({ type: 'ok', value: 6 });
	});
});

describe('Tuples - Error Cases', (): void => {
	test('should reject tuple with incorrect element count', (): void => {
		const result = interpret('let x : (I32, I32) = (3, 4, 5); x');
		expect(result.type).toBe('err');
	});

	test('should reject access to out of bounds tuple index', (): void => {
		const result = interpret('let x : (I32, I32) = (3, 4); x[5]');
		expect(result.type).toBe('err');
	});

	test('should reject negative tuple index', (): void => {
		const result = interpret('let x : (I32, I32) = (3, 4); x[-1]');
		expect(result.type).toBe('err');
	});
});

describe('Tuples - Advanced Features', (): void => {
	test('should support U8 typed tuples', (): void => {
		const result = interpret('let x : (U8, U8) = (100, 150); x[0] + x[1]');
		expect(result).toEqual({ type: 'ok', value: 250 });
	});

	test('should support computed index access', (): void => {
		const result = interpret('let x : (I32, I32, I32) = (10, 20, 30); let i : I32 = 1; x[i]');
		expect(result).toEqual({ type: 'ok', value: 20 });
	});
});
