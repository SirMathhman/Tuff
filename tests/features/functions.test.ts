import { clearFunctionRegistry } from '../../src/interpreter/functions';
import { assertInterpretValid, assertInterpretInvalid } from '../../src/testing/test-helpers';

describe('functions', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('should interpret function call add(3, 4) as 7', (): void => {
		assertInterpretValid(
			'fn add(first : I32, second : I32) : I32 => { first + second } add(3, 4)',
			7,
		);
	});

	it('should handle yield plus additional expression in function body', (): void => {
		assertInterpretValid('fn get() : I32 => { if (true) yield 100; 200 } + 1; get()', 101);
	});

	it('should short-circuit with return before trailing expression', (): void => {
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
		assertInterpretInvalid(
			'fn add(first : U8, second : U8) : U8 => { first + second } add(255, 1)',
			'out of range',
		);
	});

	it('should support method-call syntax with implicit this', (): void => {
		assertInterpretValid(
			'fn addOnce(this : I32) => this + 1; let value : I32 = 100; value.addOnce()',
			101,
		);
	});
});
