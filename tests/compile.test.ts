import { compile } from '../src/compiler/compile';
import { run } from '../src/compiler/run';

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

describe('run', (): void => {
	it('executes compiled code and returns exit code', (): void => {
		const result = run('100');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(0);
		}
	});
});
