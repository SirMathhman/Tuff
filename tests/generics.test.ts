import { clearFunctionRegistry } from '../src/functions';
import { expectInterpretOk } from '../src/testing/test-helpers';

describe('interpret - generics', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('generic function with identity', (): void => {
		expectInterpretOk('fn pass<T>(value : T) : T => value; pass(100)', 100);
	});
});
