import { clearFunctionRegistry } from '../src/interpreter/functions';
import { expectInterpretOk } from '../src/testing/test-helpers';

describe('interpret - return expressions', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows return in non-braced function body', (): void => {
		expectInterpretOk('fn get() => return 100; get()', 100);
	});
});
