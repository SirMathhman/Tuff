import { run } from '../src/app';

describe('The compiler', (): void => {
	it('should compile a simple program', (): void => {
		expect(run('', '')).toBe(0);
	});

	it('reads U8 from stdin', (): void => {
		expect(run('read U8', '100')).toBe(100);
	});
});
