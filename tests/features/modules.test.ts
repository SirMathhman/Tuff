import { clearFunctionRegistry } from '../../src/interpreter/functions';
import { clearModuleRegistry } from '../../src/interpreter/modules';
import { assertCompileValid, assertInterpretAndCompileValid } from '../../src/testing/test-helpers';

describe('modules', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
		clearModuleRegistry();
	});

	it('allows defining functions in a module', (): void => {
		assertInterpretAndCompileValid('module things { fn get() => 100; } things::get()', 100);
	});
});

describe('modules - compiler read<T>() tests', (): void => {
	beforeEach((): void => {
		clearFunctionRegistry();
		clearModuleRegistry();
	});

	it('module function with runtime input', (): void => {
		assertCompileValid(
			'module math { fn double(x : I32) => x * 2; } math::double(read<I32>())',
			'21',
			42,
		);
	});
});
