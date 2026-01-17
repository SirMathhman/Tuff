import {
	assertInterpretAndCompileValid,
	assertInterpretAndCompileInvalid,
	assertInvalid
} from '../../src/testing/test-helpers';
import { interpret } from '../../src/interpret';

describe('top-level statements', (): void => {
	it('should interpret "let z = 7; z" as 7', (): void => {
		assertInterpretAndCompileValid('let z = 7; z', 7);
	});
	it('should interpret "let z = 1 + 1; z" as 2', (): void => {
		assertInterpretAndCompileValid('let z = 1 + 1; z', 2);
	});
	it('should interpret "let z = 10 / ({ let x = 7; let y = x; y } - 2); z" as 2', (): void => {
		assertInterpretAndCompileValid('let z = 10 / ({ let x = 7; let y = x; y } - 2); z', 2);
	});
	it('should interpret "let x : I32; x = 2; x" as 2', (): void => {
		assertInterpretAndCompileValid('let x : I32; x = 2; x', 2);
	});
	it('should return Err for uninitialized variable usage', (): void => {
		assertInterpretAndCompileInvalid('let x : I32; x', 'not initialized');
	});
	it('should interpret "let x : I32; x = 5; x + 3" as 8', (): void => {
		assertInterpretAndCompileValid('let x : I32; x = 5; x + 3', 8);
	});
});

describe('mutability', (): void => {
	it('should interpret "let mut x = 0; x = 100; x" as 100', (): void => {
		assertInterpretAndCompileValid('let mut x = 0; x = 100; x', 100);
	});
	it('should interpret "let mut x = 5; x += 1; x" as 6', (): void => {
		assertInterpretAndCompileValid('let mut x = 5; x += 1; x', 6);
	});
	it('should interpret "let mut x = 5; x+=1; x" as 6 (no spaces)', (): void => {
		assertInterpretAndCompileValid('let mut x = 5; x+=1; x', 6);
	});
	it('should interpret "let mut x = 5; x = x + 1; x" as 6', (): void => {
		assertInterpretAndCompileValid('let mut x = 5; x = x + 1; x', 6);
	});
	it('should interpret "let mut x = 0; x += 1; x" as 1', (): void => {
		assertInterpretAndCompileValid('let mut x = 0; x += 1; x', 1);
	});
	it('should return Err for "let x = 0; x = 100; x" (immutable)', (): void => {
		assertInterpretAndCompileInvalid('let x = 0; x = 100; x', 'not mutable');
	});
	it('should return Err for "let x : I32 = 0; x = 100; x = 2; x" (immutable with type)', (): void => {
		assertInterpretAndCompileInvalid('let x : I32 = 0; x = 100; x = 2; x', 'not mutable');
	});
	it('should interpret "let mut x : I32 = 0; x = 100; x = 2; x" as 2', (): void => {
		assertInterpretAndCompileValid('let mut x : I32 = 0; x = 100; x = 2; x', 2);
	});
	it('should interpret "let mut x = 0; { x = 100; } x" as 100', (): void => {
		assertInterpretAndCompileValid('let mut x = 0; { x = 100; } x', 100);
	});
	it('should return Err for "{ let mut x = 0; } x = 100; x" (x only mutable in block scope)', (): void => {
		assertInterpretAndCompileInvalid('{ let mut x = 0; } x = 100; x', 'Undefined');
	});
	it('should interpret "let x = { let y = 100; y }; x" as 100', (): void => {
		assertInterpretAndCompileValid('let x = { let y = 100; y }; x', 100);
	});
});

describe('booleans and if expressions', (): void => {
	it('should interpret "let x : Bool = true; x" as 1', (): void => {
		assertInterpretAndCompileValid('let x : Bool = true; x', 1);
	});
	it('should interpret "let x : Bool = true; let y : Bool = false; x || y" as 1', (): void => {
		assertInterpretAndCompileValid('let x : Bool = true; let y : Bool = false; x || y', 1);
	});
	it('should interpret "let x : Bool = true; let y : Bool = false; x && y" as 0', (): void => {
		assertInterpretAndCompileValid('let x : Bool = true; let y : Bool = false; x && y', 0);
	});
	it('should interpret "if (true) 100 else 200" as 100', (): void => {
		assertInterpretAndCompileValid('if (true) 100 else 200', 100);
	});
	it('should interpret "if (false) 100 else 200" as 200', (): void => {
		assertInterpretAndCompileValid('if (false) 100 else 200', 200);
	});
	it('should interpret "let x = if (true) 100 else 200; x" as 100', (): void => {
		assertInterpretAndCompileValid('let x = if (true) 100 else 200; x', 100);
	});
	it('should interpret "let x = if (false) 100 else 200; x" as 200', (): void => {
		assertInterpretAndCompileValid('let x = if (false) 100 else 200; x', 200);
	});
	it('should interpret "if (1) 42 else 0" as 42', (): void => {
		assertInterpretAndCompileValid('if (1) 42 else 0', 42);
	});
	it('should interpret "if (0) 42 else 0" as 0', (): void => {
		assertInterpretAndCompileValid('if (0) 42 else 0', 0);
	});
	it('should interpret "if (1 + 2) 100 else 50" as 100', (): void => {
		assertInterpretAndCompileValid('if (1 + 2) 100 else 50', 100);
	});
	it('should interpret nested if-else: "if (true) if (false) 1 else 2 else 3" as 2', (): void => {
		assertInterpretAndCompileValid('if (true) if (false) 1 else 2 else 3', 2);
	});
});

describe('if statements and yield', (): void => {
	it('should interpret "let x : I32; if (true) x = 100; else x = 200; x" as 100', (): void => {
		assertInterpretAndCompileValid('let x : I32; if (true) x = 100; else x = 200; x', 100);
	});
	it('should interpret "let x : I32; if (false) x = 100; else x = 200; x" as 200', (): void => {
		assertInterpretAndCompileValid('let x : I32; if (false) x = 100; else x = 200; x', 200);
	});
	it('should interpret "let x : I32; if (true) { x = 100; } else { x = 200; } x" as 100', (): void => {
		assertInterpretAndCompileValid('let x : I32; if (true) { x = 100; } else { x = 200; } x', 100);
	});
	it('should interpret "let x : I32; if (false) { x = 100; } else { x = 200; } x" as 200', (): void => {
		assertInterpretAndCompileValid('let x : I32; if (false) { x = 100; } else { x = 200; } x', 200);
	});
	it('should interpret "let mut x = 0; if (true) x = 100; x" as 100', (): void => {
		assertInterpretAndCompileValid('let mut x = 0; if (true) x = 100; x', 100);
	});
	it('should interpret "let mut x = 0; if (false) x = 100; x" as 0', (): void => {
		assertInterpretAndCompileValid('let mut x = 0; if (false) x = 100; x', 0);
	});
	it('should interpret "{ yield 100; 200 }" as 100', (): void => {
		assertInterpretAndCompileValid('{ yield 100; 200 }', 100);
	});
	it('should interpret "let x = { yield 100; 200 }; x" as 100', (): void => {
		assertInterpretAndCompileValid('let x = { yield 100; 200 }; x', 100);
	});
	it('should interpret "let x = { if (true) yield 100; 200 }; x" as 100', (): void => {
		assertInterpretAndCompileValid('let x = { if (true) yield 100; 200 }; x', 100);
	});
	it('should interpret "let x = { if (false) yield 100; 200 }; x" as 200', (): void => {
		assertInterpretAndCompileValid('let x = { if (false) yield 100; 200 }; x', 200);
	});
	it('should interpret "{ if (true) yield 100; else yield 200; }" as 100', (): void => {
		assertInterpretAndCompileValid('{ if (true) yield 100; else yield 200; }', 100);
	});
	it('should interpret "{ if (false) yield 100; else yield 200; }" as 200', (): void => {
		assertInterpretAndCompileValid('{ if (false) yield 100; else yield 200; }', 200);
	});
});

describe('chained if-else and match', (): void => {
	it('should interpret "let x = if (false) 100 else if (true) 200 else 300; x" as 200', (): void => {
		assertInterpretAndCompileValid('let x = if (false) 100 else if (true) 200 else 300; x', 200);
	});
	it('should interpret "if (false) 100 else if (false) 200 else 300" as 300', (): void => {
		assertInterpretAndCompileValid('if (false) 100 else if (false) 200 else 300', 300);
	});
	it('should interpret "if (true) 100 else if (true) 200 else 300" as 100', (): void => {
		assertInterpretAndCompileValid('if (true) 100 else if (true) 200 else 300', 100);
	});
	it('should interpret "let x : I32; if (false) x = 100; else x = 200; x" as 200', (): void => {
		assertInterpretAndCompileValid('let x : I32; if (false) x = 100; else x = 200; x', 200);
	});
	it('should interpret "let x : I32 = match (100) { case 100 => 2; case _ => 3; }; x" as 2', (): void => {
		assertInterpretAndCompileValid('let x : I32 = match (100) { case 100 => 2; case _ => 3; }; x', 2);
	});
});

describe('while loops', (): void => {
	it('should interpret "let mut x = 0; while (x < 4) x += 1; x" as 4', (): void => {
		const result = interpret('let mut x = 0; while (x < 4) x += 1; x');
		if (result.type === 'err') {
			expect(result.error).toBe('SUCCESS');
		} else {
			expect(result.value).toBe(4);
		}
	});
	it('should interpret "let mut x = 10; while (x > 5) x -= 1; x" as 5', (): void => {
		assertInterpretAndCompileValid('let mut x = 10; while (x > 5) x -= 1; x', 5);
	});
	it('should interpret "let mut x = 1; while (x < 100) x = x * 2; x" as 128', (): void => {
		assertInterpretAndCompileValid('let mut x = 1; while (x < 100) x = x * 2; x', 128);
	});
	it('should interpret "let mut x = 0; while (false) x = 100; x" as 0', (): void => {
		assertInterpretAndCompileValid('let mut x = 0; while (false) x = 100; x', 0);
	});
	it('should interpret "let mut sum = 0; let mut i = 1; while (i <= 5) { sum += i; i += 1; } sum" as 15', (): void => {
		assertInterpretAndCompileValid(
			'let mut sum = 0; let mut i = 1; while (i <= 5) { sum += i; i += 1; } sum',
			15,
		);
	});
	it('should interpret "let mut x = 0; while (x < 4) { x += 1; } x" as 4', (): void => {
		assertInterpretAndCompileValid('let mut x = 0; while (x < 4) { x += 1; } x', 4);
	});
	it('should return Err for "let x = 0; while (true) x += 1; x" (immutable)', (): void => {
		assertInvalid(interpret('let x = 0; while (true) x += 1; x'), 'not mutable');
	});
});

describe('for loops', (): void => {
	it('should interpret "let mut sum = 0; for (let mut i in 0..10) sum += i; sum" as 45', (): void => {
		assertInterpretAndCompileValid('let mut sum = 0; for (let mut i in 0..10) sum += i; sum', 45);
	});
	it('should interpret "let mut sum = 0; for (let mut i in 0..5) sum += i; sum" as 10', (): void => {
		assertInterpretAndCompileValid('let mut sum = 0; for (let mut i in 0..5) sum += i; sum', 10);
	});
	it('should interpret "let mut product = 1; for (let mut i in 1..5) product *= i; product" as 24', (): void => {
		assertInterpretAndCompileValid('let mut product = 1; for (let mut i in 1..5) product *= i; product', 24);
	});
	it('should interpret "let mut x = 0; for (let mut i in 0..3) x = i; x" (last iteration)', (): void => {
		// for loop updates x to the last iteration value (2)
		assertInterpretAndCompileValid('let mut x = 0; for (let mut i in 0..3) x = i; x', 2);
	});
	it('should interpret "let mut sum = 0; for (let mut i in 2..7) { sum += i; } sum" as 20', (): void => {
		// 2+3+4+5+6 = 20 (range is exclusive on end)
		assertInterpretAndCompileValid('let mut sum = 0; for (let mut i in 2..7) { sum += i; } sum', 20);
	});
	it('should return Err for "let sum = 0; for (let mut i in 0..5) sum += i; sum" (immutable outer)', (): void => {
		assertInvalid(interpret('let sum = 0; for (let mut i in 0..5) sum += i; sum'), 'not mutable');
	});
});
