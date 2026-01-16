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

	it('should interpret "let z = 7; z" as 7', () => {
		const result = interpret('let z = 7; z');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(7);
		}
	});

	it('should interpret "let z = 1 + 1; z" as 2', () => {
		const result = interpret('let z = 1 + 1; z');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(2);
		}
	});

	it('should interpret "let z = 10 / ({ let x = 7; let y = x; y } - 2); z" as 2', () => {
		const result = interpret('let z = 10 / ({ let x = 7; let y = x; y } - 2); z');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(2);
		}
	});

	it('should interpret "let x : I32; x = 2; x" as 2', () => {
		const result = interpret('let x : I32; x = 2; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(2);
		}
	});

	it('should return Err for uninitialized variable usage', () => {
		const result = interpret('let x : I32; x');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('not initialized');
		}
	});

	it('should interpret "let x : I32; x = 5; x + 3" as 8', () => {
		const result = interpret('let x : I32; x = 5; x + 3');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(8);
		}
	});

	it('should interpret "let mut x = 0; x = 100; x" as 100', () => {
		const result = interpret('let mut x = 0; x = 100; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should return Err for "let x = 0; x = 100; x" (immutable)', () => {
		const result = interpret('let x = 0; x = 100; x');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('not mutable');
		}
	});

	it('should return Err for "let x : I32 = 0; x = 100; x = 2; x" (immutable with type)', () => {
		const result = interpret('let x : I32 = 0; x = 100; x = 2; x');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('not mutable');
		}
	});

	it('should interpret "let mut x : I32 = 0; x = 100; x = 2; x" as 2', () => {
		const result = interpret('let mut x : I32 = 0; x = 100; x = 2; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(2);
		}
	});

	it('should interpret "let mut x = 0; { x = 100; } x" as 100', () => {
		const result = interpret('let mut x = 0; { x = 100; } x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should return Err for "{ let mut x = 0; } x = 100; x" (x only mutable in block scope)', () => {
		const result = interpret('{ let mut x = 0; } x = 100; x');
		expect(result.type).toBe('err');
		if (result.type === 'err') {
			expect(result.error).toContain('Undefined');
		}
	});

	it('should interpret "let x = { let y = 100; y }; x" as 100', () => {
		const result = interpret('let x = { let y = 100; y }; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret "let x : Bool = true; x" as 1', () => {
		const result = interpret('let x : Bool = true; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(1);
		}
	});

	it('should interpret "let x : Bool = true; let y : Bool = false; x || y" as 1', () => {
		const result = interpret('let x : Bool = true; let y : Bool = false; x || y');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(1);
		}
	});

	it('should interpret "let x : Bool = true; let y : Bool = false; x && y" as 0', () => {
		const result = interpret('let x : Bool = true; let y : Bool = false; x && y');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(0);
		}
	});

	it('should interpret "if (true) 100 else 200" as 100', () => {
		const result = interpret('if (true) 100 else 200');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret "if (false) 100 else 200" as 200', () => {
		const result = interpret('if (false) 100 else 200');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(200);
		}
	});

	it('should interpret "let x = if (true) 100 else 200; x" as 100', () => {
		const result = interpret('let x = if (true) 100 else 200; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret "let x = if (false) 100 else 200; x" as 200', () => {
		const result = interpret('let x = if (false) 100 else 200; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(200);
		}
	});

	it('should interpret "if (1) 42 else 0" as 42', () => {
		const result = interpret('if (1) 42 else 0');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(42);
		}
	});

	it('should interpret "if (0) 42 else 0" as 0', () => {
		const result = interpret('if (0) 42 else 0');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(0);
		}
	});

	it('should interpret "if (1 + 2) 100 else 50" as 100', () => {
		const result = interpret('if (1 + 2) 100 else 50');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret nested if-else: "if (true) if (false) 1 else 2 else 3" as 2', () => {
		const result = interpret('if (true) if (false) 1 else 2 else 3');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(2);
		}
	});

	it('should interpret "let x : I32; if (true) x = 100; else x = 200; x" as 100', () => {
		const result = interpret('let x : I32; if (true) x = 100; else x = 200; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret "let x : I32; if (false) x = 100; else x = 200; x" as 200', () => {
		const result = interpret('let x : I32; if (false) x = 100; else x = 200; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(200);
		}
	});

	it('should interpret "let x : I32; if (true) { x = 100; } else { x = 200; } x" as 100', () => {
		const result = interpret('let x : I32; if (true) { x = 100; } else { x = 200; } x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret "let x : I32; if (false) { x = 100; } else { x = 200; } x" as 200', () => {
		const result = interpret('let x : I32; if (false) { x = 100; } else { x = 200; } x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(200);
		}
	});

	it('should interpret "let mut x = 0; if (true) x = 100; x" as 100', () => {
		const result = interpret('let mut x = 0; if (true) x = 100; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret "let mut x = 0; if (false) x = 100; x" as 0', () => {
		const result = interpret('let mut x = 0; if (false) x = 100; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(0);
		}
	});

	it('should interpret "{ yield 100; 200 }" as 100', () => {
		const result = interpret('{ yield 100; 200 }');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret "let x = { yield 100; 200 }; x" as 100', () => {
		const result = interpret('let x = { yield 100; 200 }; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret "let x = { if (true) yield 100; 200 }; x" as 100', () => {
		const result = interpret('let x = { if (true) yield 100; 200 }; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret "let x = { if (false) yield 100; 200 }; x" as 200', () => {
		const result = interpret('let x = { if (false) yield 100; 200 }; x');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(200);
		}
	});

	it('should interpret "{ if (true) yield 100; else yield 200; }" as 100', () => {
		const result = interpret('{ if (true) yield 100; else yield 200; }');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(100);
		}
	});

	it('should interpret "{ if (false) yield 100; else yield 200; }" as 200', () => {
		const result = interpret('{ if (false) yield 100; else yield 200; }');
		expect(result.type).toBe('ok');
		if (result.type === 'ok') {
			expect(result.value).toBe(200);
		}
	});
});
