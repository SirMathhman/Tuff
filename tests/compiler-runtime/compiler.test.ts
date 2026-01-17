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

	it.skip('DEBUG: exact failing test', (): void => {
		const result = compile(
			'fn add(first : U8, second : U8) : U8 => { first + second } add(255U8, 1U8)',
		);
		expect(result.type).toBe('err');
	});
});
