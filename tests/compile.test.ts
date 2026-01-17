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
		const result = run('100', '');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(0);
		}
	});

	it('reads from stdin and returns the value', (): void => {
		const result = run('read<I32>()', '100');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('reads U8 from stdin and validates range', (): void => {
		const result = run('read<U8>()', '256');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(1);
		}
	});

	it('reads multiple values from stdin', (): void => {
		const result = run('read<U8>() + read<U8>()', '1 2');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(3);
		}
	});

	it('reads three values from stdin', (): void => {
		const result = run('read<U8>() + read<U8>() + read<U8>()', '1 2 3');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(6);
		}
	});

	it('reads multiple values with mixed operations', (): void => {
		const result = run('read<U8>() + read<U8>() - read<U8>()', '2 3 4');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(1);
		}
	});

	it('reads multiple values with multiplication', (): void => {
		const result = run('read<U8>() * read<U8>() - read<U8>()', '2 3 4');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(2);
		}
	});

	it('reads multiple values with multiplication precedence', (): void => {
		const result = run('read<U8>() + read<U8>() * read<U8>()', '4 2 3');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(10);
		}
	});

	it('reads multiple values with parentheses', (): void => {
		const result = run('(read<U8>() + read<U8>()) * read<U8>()', '4 2 3');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(18);
		}
	});
});
