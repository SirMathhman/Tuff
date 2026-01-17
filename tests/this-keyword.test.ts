import { expectInterpretOk } from '../src/testing/test-helpers';

describe('interpret - this keyword', (): void => {
	it('allows this.field to access current scope variables', (): void => {
		expectInterpretOk('let x = 100; this.x', 100);
	});

	it('works with multiple variables', (): void => {
		expectInterpretOk('let x = 10; let y = 20; this.x + this.y', 30);
	});
});
