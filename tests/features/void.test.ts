import { clearFunctionRegistry } from '../../src/interpreter/functions';
import { assertCompileValid, assertInterpretAndCompileValid } from '../../src/testing/test-helpers';

describe('Void', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows Void function references with side effects', (): void => {
		assertInterpretAndCompileValid(
			'let mut x = 0; fn add() : Void => x += 1; let temp : () => Void = add; temp(); x',
			1,
		);
	});
});

describe('Void - compiler read<T>() tests', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('Void function with runtime side effect', (): void => {
		assertCompileValid(
			'let mut x = read<I32>(); fn add() : Void => x += 1; let temp : () => Void = add; temp(); x',
			'10',
			11,
		);
	});
});
