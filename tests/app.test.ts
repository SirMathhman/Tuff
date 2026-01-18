import { run } from '../src/app';

describe('The compiler', (): void => {
	it('should compile a simple program', (): void => {
		expect(run('', '')).toBe(0);
	});
});
