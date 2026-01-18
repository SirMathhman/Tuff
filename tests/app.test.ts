import { run } from '../src/app';

describe('The compiler', (): void => {
	it('should compile a simple program', (): void => {
		expect(run('', '')).toBe(0);
	});

	it('reads U8 from stdin', (): void => {
		expect(run('read U8', '100')).toBe(100);
	});

	it('reads U8 in an expression', (): void => {
		expect(run('read U8 + 1', '100')).toBe(101);
	});

	it('reads multiple U8 from stdin', (): void => {
		expect(run('read U8 + read U8', '1 2')).toBe(3);
	});
});
