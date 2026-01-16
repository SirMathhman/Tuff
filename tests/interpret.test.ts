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

	it('should interpret "4 + 2 * 3" as 10', () => {
		const result = interpret('4 + 2 * 3');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(10);
		}
	});

	it('should interpret "(4)" as 4', () => {
		const result = interpret('(4)');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(4);
		}
	});

	it('should interpret "(4 + 2) * 3" as 18', () => {
		const result = interpret('(4 + 2) * 3');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(18);
		}
	});

	it('should interpret "1 + (4 + 2) * 3" as 19', () => {
		const result = interpret('1 + (4 + 2) * 3');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(19);
		}
	});

	it('should return Err for "10 / (2 - 2)"', () => {
		const result = interpret('10 / (2 - 2)');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('Division by zero');
		}
	});

	it('should interpret "{ 7 }" as 7', () => {
		const result = interpret('{ 7 }');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(7);
		}
	});

	it('should interpret "10 / ({ 7 } - 2)" as 2', () => {
		const result = interpret('10 / ({ 7 } - 2)');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(2);
		}
	});

	it('should interpret "{ 2 } * 3 + 1" as 7', () => {
		const result = interpret('{ 2 } * 3 + 1');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(7);
		}
	});

	it('should interpret "1 + { 4 + 2 } * 3" as 19', () => {
		const result = interpret('1 + { 4 + 2 } * 3');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(19);
		}
	});

	it('should interpret "{ let x = 7; x }" as 7', () => {
		const result = interpret('{ let x = 7; x }');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(7);
		}
	});

	it('should interpret "10 / ({ let x = 7; x } - 2)" as 2', () => {
		const result = interpret('10 / ({ let x = 7; x } - 2)');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(2);
		}
	});

	it('should interpret "{ let x = 5; x + 3 }" as 8', () => {
		const result = interpret('{ let x = 5; x + 3 }');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(8);
		}
	});

	it('should interpret "{ let x = 10; let y = 3; x / y }" as 3', () => {
		const result = interpret('{ let x = 10; let y = 3; x / y }');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(3);
		}
	});

	it('should return Err for undefined variable', () => {
		const result = interpret('{ x }');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('Undefined');
		}
	});

	it('should interpret "{ let x : I32 = 7; x }" as 7', () => {
		const result = interpret('{ let x : I32 = 7; x }');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(7);
		}
	});

	it('should interpret "10 / ({ let x : I32 = 7; x } - 2)" as 2', () => {
		const result = interpret('10 / ({ let x : I32 = 7; x } - 2)');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(2);
		}
	});

	it('should return Err for out of range typed variable', () => {
		const result = interpret('{ let x : U8 = 256; x }');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('out of range');
		}
	});

	it('should interpret "{ let x : I16 = -100; x }" as -100', () => {
		const result = interpret('{ let x : I16 = -100; x }');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(-100);
		}
	});

	it('should interpret "{ let x : U32 = 1000000; x + 1 }" as 1000001', () => {
		const result = interpret('{ let x : U32 = 1000000; x + 1 }');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(1000001);
		}
	});

	it('should return Err for "{ let x : I32 = 7; }" (no expression)', () => {
		const result = interpret('{ let x : I32 = 7; }');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('expression');
		}
	});

	it('should return Err for "10 / ({ let x : I32 = 7; } - 2)"', () => {
		const result = interpret('10 / ({ let x : I32 = 7; } - 2)');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('expression');
		}
	});

	it('should return Err for duplicate variable names', () => {
		const result = interpret('{ let x = 7; let x = 20; x }');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('already defined');
		}
	});

	it('should return Err for "10 / ({ let x = 7; let x = 20; x } - 2)"', () => {
		const result = interpret('10 / ({ let x = 7; let x = 20; x } - 2)');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('already defined');
		}
	});

	it('should interpret "10 / ({ let x = 7; let y = x; y } - 2)" as 2', () => {
		const result = interpret('10 / ({ let x = 7; let y = x; y } - 2)');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(2);
		}
	});
});
