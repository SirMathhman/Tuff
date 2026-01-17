import { clearFunctionRegistry } from '../../src/interpreter/functions';
import { assertInterpretValid } from '../../src/testing/test-helpers';

describe('interpret - closures - basics', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('captures mutable variable and modifies it', (): void => {
		assertInterpretValid('let mut x = 0; fn add() => { x += 1; x }; add(); add(); x', 2);
	});

	it('closure reads captured variable', (): void => {
		assertInterpretValid('let y = 10; fn get() => y; get()', 10);
	});

	it('closure with parameter and captured var', (): void => {
		assertInterpretValid(
			'let mut sum = 0; fn addTo(n : I32) => { sum += n; sum }; addTo(5); addTo(3); sum',
			8,
		);
	});

	it('multiple closures capture same var', (): void => {
		assertInterpretValid(
			'let mut x = 1; fn double() => { x += x; x }; fn add5() => { x += 5; x }; double(); add5(); x',
			7,
		);
	});

	it('closure sees variable updates', (): void => {
		assertInterpretValid('let mut x = 1; x = 5; fn get() => x; get()', 5);
	});
});

describe('interpret - closures - nested functions', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('nested function captures outer function parameter', (): void => {
		assertInterpretValid('fn pass(value : I32) => { fn get() => value; get() } pass(100)', 100);
	});

	it('nested function with multiple captures', (): void => {
		assertInterpretValid(
			'fn outer(a : I32, b : I32) => { fn inner() => a + b; inner() } outer(10, 20)',
			30,
		);
	});

	it('deeply nested functions', (): void => {
		assertInterpretValid(
			'fn outer(x : I32) => { fn middle(y : I32) => { fn inner() => x + y; inner() } middle(5) } outer(10)',
			15,
		);
	});
});

describe('interpret - closures - returns closure', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('returns a closure that captures a parameter', (): void => {
		assertInterpretValid(
			'fn pass(value : I32) : () => I32 => { fn get() => value; get } pass(100)()',
			100,
		);
	});
});
