import { clearFunctionRegistry } from '../src/interpreter/functions';
import { assertInterpretValid } from '../src/testing/test-helpers';

describe('interpret - return expressions', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows return in non-braced function body', (): void => {
		assertInterpretValid('fn get() => return 100; get()', 100);
	});
});
