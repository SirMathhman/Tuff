import { compile, run } from '../src/app';

function assertValid(source: string, stdin: string, expected: number): void {
	const result = run(source, stdin);
	expect(result.success).toBe(true);
	if (result.success) {
		expect(result.value).toBe(expected);
	}
}

function assertInvalid(source: string): void {
	const result = compile(source);
	expect(result.success).toBe(false);
}

describe('The compiler - basic', (): void => {
	it('should compile a simple program', (): void => {
		assertValid('', '', 0);
	});

	it('reads U8 from stdin', (): void => {
		assertValid('read U8', '100', 100);
	});

	it('reads U8 in an expression', (): void => {
		assertValid('read U8 + 1', '100', 101);
	});
});

describe('The compiler - multi-reads', (): void => {
	it('reads multiple U8 from stdin', (): void => {
		assertValid('read U8 + read U8', '1 2', 3);
	});

	it('reads three U8 from stdin', (): void => {
		assertValid('read U8 + read U8 + read U8', '1 2 3', 6);
	});

	it('handles arithmetic with multiple reads', (): void => {
		assertValid('read U8 - read U8 + read U8', '4 3 2', 3);
	});
});

describe('The compiler - precedence and grouping', (): void => {
	it('handles operator precedence with reads', (): void => {
		assertValid('read U8 * read U8 + read U8', '4 3 2', 14);
	});

	it('handles operator precedence with reads #2', (): void => {
		assertValid('read U8 + read U8 * read U8', '4 3 2', 10);
	});

	it('handles parentheses with reads', (): void => {
		assertValid('(read U8 + read U8) * read U8', '4 3 2', 14);
	});

	it('handles curly braces as grouping', (): void => {
		assertValid('(read U8 + { read U8 }) * read U8', '4 3 2', 14);
	});
});

describe('The compiler - let bindings', (): void => {
	it('handles let bindings in blocks', (): void => {
		assertValid('(read U8 + { let x : U8 = read U8; x }) * read U8', '4 3 2', 14);
	});

	it('handles multiple let bindings in blocks', (): void => {
		assertValid('(read U8 + { let x : U8 = read U8; let y : U8 = x; y }) * read U8', '4 3 2', 14);
	});

	it('handles outer let binding with nested blocks', (): void => {
		assertValid(
			'let z : U8 = (read U8 + { let x : U8 = read U8; let y : U8 = x; y }) * read U8; z',
			'4 3 2',
			14,
		);
	});

	it('handles top-level let binding with read U8', (): void => {
		assertValid('let z : U8 = read U8; z', '42', 42);
	});
});

describe('The compiler - error handling', (): void => {
	it('fails on type mismatch: U8 = read U16', (): void => {
		assertInvalid('let z : U8 = read U16; z');
	});
});

describe('The compiler - wrapping', (): void => {
	it('wraps U8 values during addition', (): void => {
		assertValid('read U8 + read U8', '200 100', 44); // (200 + 100) & 255 = 44
	});

	it('wraps U8 values during multiplication', (): void => {
		assertValid('read U8 * read U8', '10 30', 44); // (10 * 30) & 255 = 44 (300 & 255 = 44)
	});

	it('wraps U8 values in let assignments', (): void => {
		assertValid('{ let x : U8 = 257; x }', '', 1);
	});

	it('wraps U8 values in let assignments before they are used', (): void => {
		assertValid('{ let x : U8 = 257; x + 1 }', '', 2);
	});

	it('wraps U8 values in let assignments before they are used #2', (): void => {
		assertValid('{ let x : U8 = 200; let y : U8 = 200; x + y }', '', 144);
	});
});
