import { clearFunctionRegistry } from '../../src/interpreter/functions';
import { clearModuleRegistry } from '../../src/interpreter/modules';
import { assertInterpretValid } from '../../src/testing/test-helpers';

describe('interpret - modules', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
		clearModuleRegistry();
	});

	it('allows defining functions in a module', (): void => {
		assertInterpretValid('module things { fn get() => 100; } things::get()', 100);
	});
});
