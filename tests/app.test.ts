import { run } from '../src/app';

describe('The compiler - basic', (): void => {
	it('should compile a simple program', (): void => {
		const result = run('', '');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(0);
		}
	});

	it('reads U8 from stdin', (): void => {
		const result = run('read U8', '100');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(100);
		}
	});

	it('reads U8 in an expression', (): void => {
		const result = run('read U8 + 1', '100');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(101);
		}
	});
});

describe('The compiler - multi-reads', (): void => {
	it('reads multiple U8 from stdin', (): void => {
		const result = run('read U8 + read U8', '1 2');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(3);
		}
	});

	it('reads three U8 from stdin', (): void => {
		const result = run('read U8 + read U8 + read U8', '1 2 3');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(6);
		}
	});

	it('handles arithmetic with multiple reads', (): void => {
		const result = run('read U8 - read U8 + read U8', '4 3 2');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(3);
		}
	});
});

describe('The compiler - precedence and grouping', (): void => {
	it('handles operator precedence with reads', (): void => {
		const result = run('read U8 * read U8 + read U8', '4 3 2');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(14);
		}
	});

	it('handles operator precedence with reads #2', (): void => {
		const result = run('read U8 + read U8 * read U8', '4 3 2');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(10);
		}
	});

	it('handles parentheses with reads', (): void => {
		const result = run('(read U8 + read U8) * read U8', '4 3 2');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(14);
		}
	});

	it('handles curly braces as grouping', (): void => {
		const result = run('(read U8 + { read U8 }) * read U8', '4 3 2');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(14);
		}
	});
});

describe('The compiler - let bindings', (): void => {
	it('handles let bindings in blocks', (): void => {
		const result = run('(read U8 + { let x : U8 = read U8; x }) * read U8', '4 3 2');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(14);
		}
	});

	it('handles multiple let bindings in blocks', (): void => {
		const result = run('(read U8 + { let x : U8 = read U8; let y : U8 = x; y }) * read U8', '4 3 2');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(14);
		}
	});

	it('handles outer let binding with nested blocks', (): void => {
		const result = run(
			'let z : U8 = (read U8 + { let x : U8 = read U8; let y : U8 = x; y }) * read U8; z',
			'4 3 2',
		);

		if (result.success) {
			expect(result.value).toBe(14);
		} else {
			expect(result.error).toBeUndefined();
		}
	});
});

describe('The compiler - error handling', (): void => {
	it('fails on lowercase read u8', (): void => {
		const result = run('read u8', '100');
		expect(result.success).toBe(false);
	});
});

describe('The compiler - wrapping', (): void => {
	it('wraps U8 values during addition', (): void => {
		const result = run('read U8 + read U8', '200 100');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(44); // (200 + 100) & 255 = 44
		}
	});

	it('wraps U8 values during multiplication', (): void => {
		const result = run('read U8 * read U8', '10 30');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(44); // (10 * 30) & 255 = 44 (300 & 255 = 44)
		}
	});

	it('wraps U8 values in let assignments', (): void => {
		const result = run('{ let x : U8 = 257; x }', '');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(1);
		}
	});

	it('wraps U8 values in let assignments before they are used', (): void => {
		const result = run('{ let x : U8 = 257; x + 1 }', '');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(2);
		}
	});

	it('wraps U8 values in let assignments before they are used #2', (): void => {
		const result = run('{ let x : U8 = 200; let y : U8 = 200; x + y }', '');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toBe(144);
		}
	});
});
