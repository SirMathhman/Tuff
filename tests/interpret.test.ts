import { interpret } from '../src/interpret';

describe('interpret', () => {
	it('should interpret "100" as 100', () => {
		const result = interpret('100');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret "100U8" as 100', () => {
		const result = interpret('100U8');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should return Err for "-100U8"', () => {
		const result = interpret('-100U8');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('Negative');
		}
	});

	it('should return Err for "256U8"', () => {
		const result = interpret('256U8');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('out of range');
		}
	});

	it('should interpret "1U8 + 2U8" as 3', () => {
		const result = interpret('1U8 + 2U8');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(3);
		}
	});

	it('should interpret "1 + 2U8" as 3', () => {
		const result = interpret('1 + 2U8');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(3);
		}
	});

	it('should interpret "1U8 + 2" as 3', () => {
		const result = interpret('1U8 + 2');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(3);
		}
	});

	it('should return Err for "1U8 + 255"', () => {
		const result = interpret('1U8 + 255');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('out of range');
		}
	});

	it('should interpret "1U8 + 2U16" as 3', () => {
		const result = interpret('1U8 + 2U16');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(3);
		}
	});

	it('should return Err for "1U8 + 65535U16"', () => {
		const result = interpret('1U8 + 65535U16');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('out of range');
		}
	});

	it('should interpret "1U8 + 255U16" as 256', () => {
		const result = interpret('1U8 + 255U16');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(256);
		}
	});

	it('should interpret "255U16 + 1U8" as 256', () => {
		const result = interpret('255U16 + 1U8');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(256);
		}
	});

	it('should interpret "1 + 2 + 3" as 6', () => {
		const result = interpret('1 + 2 + 3');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(6);
		}
	});

	it('should return Err for "254 + 1U8 + 1"', () => {
		const result = interpret('254 + 1U8 + 1');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('out of range');
		}
	});

	it('should return Err for "1U8 - 2"', () => {
		const result = interpret('1U8 - 2');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('out of range');
		}
	});

	it('should interpret "1I8 - 2" as -1', () => {
		const result = interpret('1I8 - 2');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(-1);
		}
	});

	it('should interpret "2 + 3 - 4" as 1', () => {
		const result = interpret('2 + 3 - 4');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(1);
		}
	});

	it('should interpret "2 * 3 - 4" as 2', () => {
		const result = interpret('2 * 3 - 4');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(2);
		}
	});
});
