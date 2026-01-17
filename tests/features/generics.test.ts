import { clearFunctionRegistry } from '../../src/interpreter/functions';
import { assertCompileValid, assertInterpretAndCompileValid } from '../../src/testing/test-helpers';

describe('interpret - generics', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('generic function with identity', (): void => {
		assertInterpretAndCompileValid('fn pass<T>(value : T) : T => value; pass(100)', 100);
	});

	it('generic identity compiles with runtime input', (): void => {
		assertCompileValid('fn pass<T>(value : T) : T => value; pass(read<I32>())', '123', 123);
	});

	it('generic identity works for unsigned types at runtime', (): void => {
		assertCompileValid('fn pass<T>(value : T) : T => value; pass(read<U8>())', '250', 250);
	});
});
