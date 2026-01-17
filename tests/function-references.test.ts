import { clearFunctionRegistry } from '../src/interpreter/functions';
import { assertInterpretValid, assertInterpretInvalid } from '../src/testing/test-helpers';

describe('interpret - function references', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('basic: no params', (): void => {
		assertInterpretValid('fn get() : I32 => 100; let myGet : () => I32 = get; myGet()', 100);
	});

	it('with parameters', (): void => {
		assertInterpretValid(
			'fn add(a : I32, b : I32) : I32 => a + b; let f : (I32, I32) => I32 = add; f(2, 3)',
			5,
		);
	});

	it('U8 return type', (): void => {
		assertInterpretValid('fn get() : U8 => 50U8; let ref : () => U8 = get; ref()', 50);
	});

	it('mixed parameter types', (): void => {
		assertInterpretValid(
			'fn add(a : U8, b : I32) : I32 => a + b; let f : (U8, I32) => I32 = add; f(10U8, 20)',
			30,
		);
	});

	it('undefined function error', (): void => {
		assertInterpretInvalid('let r : () => I32 = undef; r()', 'not defined');
	});

	it('wrong arg count error', (): void => {
		assertInterpretInvalid(
			'fn add(a : I32, b : I32) : I32 => a + b; let f : (I32, I32) => I32 = add; f(5)',
			'expects 2 argument(s)',
		);
	});

	it('multiple references', (): void => {
		assertInterpretValid(
			'fn one() : I32 => 1; fn two() : I32 => 2; let f1 : () => I32 = one; let f2 : () => I32 = two; f1() + f2()',
			3,
		);
	});
});
