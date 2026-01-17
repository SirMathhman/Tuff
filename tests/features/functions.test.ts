import { clearFunctionRegistry } from '../../src/interpreter/functions';
import {
	assertCompileValid,
	assertInterpretAndCompileValid,
	assertInterpretInvalid,
	assertInterpretValid,
} from '../../src/testing/test-helpers';

describe('functions', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('should interpret function call add(3, 4) as 7', (): void => {
		assertInterpretAndCompileValid(
			'fn add(first : I32, second : I32) : I32 => { first + second } add(3, 4)',
			7,
		);
	});

	it('should handle yield plus additional expression in function body', (): void => {
		assertInterpretAndCompileValid('fn get() : I32 => { if (true) yield 100; 200 } + 1; get()', 101);
	});

	it('should short-circuit with return before trailing expression', (): void => {
		// This test is interpreter-only because the compiler uses IIFE for blocks,
		// which doesn't support early function return from within blocks
		assertInterpretValid('fn get() : I32 => { if (true) return 100; 200 } + 1; get()', 100);
	});

	it('should return Err for calling undefined function', (): void => {
		assertInterpretInvalid('add(1, 2)', 'Undefined function');
	});

	it('should return Err for wrong argument count', (): void => {
		assertInterpretInvalid(
			'fn add(first : I32, second : I32) : I32 => { first + second } add(1)',
			'expects 2 argument(s)',
		);
	});

	it('should return Err for out-of-range return value', (): void => {
		// This test is interpreter-only because the compiler cannot statically
		// detect arithmetic overflow when values come from function parameters
		assertInterpretInvalid(
			'fn add(first : U8, second : U8) : U8 => { first + second } add(255U8, 1U8)',
			'out of range',
		);
	});

	it('should support method-call syntax with implicit this', (): void => {
		assertInterpretAndCompileValid(
			'fn addOnce(this : I32) => this + 1; let value : I32 = 100; value.addOnce()',
			101,
		);
	});
});

describe('functions - compiler read<T>() tests', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('function with runtime input', (): void => {
		assertCompileValid('fn add(a : I32, b : I32) : I32 => { a + b } add(read<I32>(), 5)', '10', 15);
	});

	it('method call on runtime input', (): void => {
		assertCompileValid('fn addOnce(this : I32) => this + 1; read<I32>().addOnce()', '99', 100);
	});
});
