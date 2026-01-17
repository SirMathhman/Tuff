import { assertValid } from '../src/testing/test-helpers';

describe('interpret - yield statements', (): void => {
	it('should interpret "{ yield 100; 200 }" as 100', (): void => {
		assertValid('{ yield 100; 200 }', 100);
	});

	it('should interpret "let x = { yield 100; 200 }; x" as 100', (): void => {
		assertValid('let x = { yield 100; 200 }; x', 100);
	});

	it('should interpret "let x = { if (true) yield 100; 200 }; x" as 100', (): void => {
		assertValid('let x = { if (true) yield 100; 200 }; x', 100);
	});

	it('should interpret "let x = { if (false) yield 100; 200 }; x" as 200', (): void => {
		assertValid('let x = { if (false) yield 100; 200 }; x', 200);
	});

	it('should interpret "{ if (true) yield 100; else yield 200; }" as 100', (): void => {
		assertValid('{ if (true) yield 100; else yield 200; }', 100);
	});

	it('should interpret "{ if (false) yield 100; else yield 200; }" as 200', (): void => {
		assertValid('{ if (false) yield 100; else yield 200; }', 200);
	});
});
