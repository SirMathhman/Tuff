import { clearFunctionRegistry } from '../src/interpreter/functions';
import { expectInterpretErrContains } from '../src/testing/test-helpers';

describe('interpret - assignment expressions', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('disallows assignment in let initializer', (): void => {
		expectInterpretErrContains(
			'let mut x = 100; let mut y = x += 1; y',
			'Assignment not allowed in variable initializer',
		);
	});
});
