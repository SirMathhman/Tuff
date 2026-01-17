import { clearFunctionRegistry } from '../../src/interpreter/functions';
import { assertInterpretAndCompileInvalid } from '../../src/testing/test-helpers';

describe('assignment expressions', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
	});

	it('disallows assignment in let initializer', (): void => {
		assertInterpretAndCompileInvalid(
			'let mut x = 100; let mut y = x += 1; y',
			'Assignment not allowed in variable initializer',
		);
	});
});
