import { clearFunctionRegistry } from '../src/functions';
import { clearModuleRegistry } from '../src/modules';
import { expectInterpretOk } from '../src/testing/test-helpers';

describe('interpret - modules', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
		clearModuleRegistry();
	});

	it('allows defining functions in a module', (): void => {
		expectInterpretOk('module things { fn get() => 100; } things::get()', 100);
	});
});
