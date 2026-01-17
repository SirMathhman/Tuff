import {
	compileBracedExpressionsToIife,
	stripLetTypeAnnotations,
} from '../../src/compiler/block-expressions';
import { replaceFunctionDefinitions } from '../../src/compiler/transforms/functions';

describe('compiler - function transform', (): void => {
	it('replaces a simple fn definition after block compilation', (): void => {
		const input = '{ fn get() : I32 => 100; let myGet : () => I32 = get; myGet() }';
		const stripped = stripLetTypeAnnotations(input);
		const withBlocks = compileBracedExpressionsToIife(stripped);
		const replaced = replaceFunctionDefinitions(withBlocks);
		expect(replaced).toContain('function get(');
		expect(replaced).not.toContain('fn get');
		expect(replaced).not.toContain('let myGet =>');
		expect(replaced).toContain('let myGet = get');
	});
});
