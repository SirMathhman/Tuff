import { run } from '../src/app';

describe('The compiler', (): void => {
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
