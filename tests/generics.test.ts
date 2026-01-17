import { clearFunctionRegistry } from '../src/interpreter/functions';
import { assertValid } from '../src/testing/test-helpers';

describe('interpret - generics', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('generic function with identity', (): void => {
		assertValid('fn pass<T>(value : T) : T => value; pass(100)', 100);
	});
});
