import { clearFunctionRegistry } from '../src/interpreter/functions';
import { assertValid, assertInterpretInvalid } from '../src/testing/test-helpers';

describe('interpret - function definitions and calls', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('should interpret function call add(3, 4) as 7', (): void => {
		assertValid('fn add(first : I32, second : I32) : I32 => { first + second } add(3, 4)', 7);
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
		assertInterpretInvalid(
			'fn add(first : U8, second : U8) : U8 => { first + second } add(255, 1)',
			'out of range',
		);
	});

	it('should support method-call syntax with implicit this', (): void => {
		assertValid('fn addOnce(this : I32) => this + 1; let value : I32 = 100; value.addOnce()', 101);
	});
});

describe('interpret - function bodies with control flow', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('should handle yield plus additional expression in function body', (): void => {
		assertValid('fn get() : I32 => { if (true) yield 100; 200 } + 1; get()', 101);
	});

	it('should short-circuit with return before trailing expression', (): void => {
		assertValid('fn get() : I32 => { if (true) return 100; 200 } + 1; get()', 100);
	});
});
