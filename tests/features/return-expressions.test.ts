import { clearFunctionRegistry } from '../../src/interpreter/functions';
import { assertCompileValid, assertInterpretAndCompileValid } from '../../src/testing/test-helpers';

describe('return expressions', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows return in non-braced function body', (): void => {
		assertInterpretAndCompileValid('fn get() => return 100; get()', 100);
	});
});

describe('return expressions - compiler read<T>() tests', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('returns runtime input', (): void => {
		assertCompileValid('fn get(x : I32) => return x; get(read<I32>())', '42', 42);
	});
});
