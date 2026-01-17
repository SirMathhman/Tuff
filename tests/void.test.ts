import { clearFunctionRegistry } from '../src/interpreter/functions';
import { assertValid } from '../src/testing/test-helpers';

describe('interpret - Void', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows Void function references with side effects', (): void => {
		assertValid(
			'let mut x = 0; fn add() : Void => x += 1; let temp : () => Void = add; temp(); x',
			1,
		);
	});
});
