import { compile } from '../../src/compiler/compile';

describe('compile', (): void => {
	it('returns JavaScript code', (): void => {
		const result = compile('100');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(typeof result.value).toBe('string');
			expect(result.value.length).toBeGreaterThan(0);
		}
	});
});
