import { clearFunctionRegistry } from '../src/interpreter/functions';
import { assertInterpretValid } from '../src/testing/test-helpers';

describe('interpret - Void', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('allows Void function references with side effects', (): void => {
		assertInterpretValid(
			'let mut x = 0; fn add() : Void => x += 1; let temp : () => Void = add; temp(); x',
			1,
		);
	});
});
