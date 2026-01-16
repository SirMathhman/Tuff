import { type Result } from '../src/result';
import { interpret } from '../src/interpret';

function expectOkValue(result: Result<number>, expected: number): void {
	expect(result.type).toBe('ok');
	if (result.type === 'ok') {
		expect(result.value).toBe(expected);
	}
}

function expectErrContains(result: Result<number>, expectedSubstring: string): void {
	expect(result.type).toBe('err');
	if (result.type === 'err') {
		expect(result.error).toContain(expectedSubstring);
	}
}

function expectInterpretOk(input: string, expected: number): void {
	const result = interpret(input);
	expectOkValue(result, expected);
}

function expectInterpretErrContains(input: string, expectedSubstring: string): void {
	const result = interpret(input);
	expectErrContains(result, expectedSubstring);
}

describe('interpret - literals and arithmetic', (): void => {
	it('should interpret "100" as 100', (): void => {
		expectInterpretOk('100', 100);
	});
	it('should interpret "100U8" as 100', (): void => {
		expectInterpretOk('100U8', 100);
	});
	it('should return Err for "-100U8"', (): void => {
		expectInterpretErrContains('-100U8', 'Negative');
	});
	it('should return Err for "256U8"', (): void => {
		expectInterpretErrContains('256U8', 'out of range');
	});
	it('should interpret "1U8 + 2U8" as 3', (): void => {
		expectInterpretOk('1U8 + 2U8', 3);
	});
	it('should interpret "1 + 2U8" as 3', (): void => {
		expectInterpretOk('1 + 2U8', 3);
	});
	it('should interpret "1U8 + 2" as 3', (): void => {
		expectInterpretOk('1U8 + 2', 3);
	});
	it('should return Err for "1U8 + 255"', (): void => {
		expectInterpretErrContains('1U8 + 255', 'out of range');
	});
	it('should interpret "1U8 + 2U16" as 3', (): void => {
		expectInterpretOk('1U8 + 2U16', 3);
	});
	it('should return Err for "1U8 + 65535U16"', (): void => {
		expectInterpretErrContains('1U8 + 65535U16', 'out of range');
	});
	it('should interpret "1U8 + 255U16" as 256', (): void => {
		expectInterpretOk('1U8 + 255U16', 256);
	});
	it('should interpret "255U16 + 1U8" as 256', (): void => {
		expectInterpretOk('255U16 + 1U8', 256);
	});
	it('should interpret "1 + 2 + 3" as 6', (): void => {
		expectInterpretOk('1 + 2 + 3', 6);
	});
});

describe('interpret - arithmetic (continued)', (): void => {
	it('should return Err for "254 + 1U8 + 1"', (): void => {
		expectInterpretErrContains('254 + 1U8 + 1', 'out of range');
	});
	it('should return Err for "1U8 - 2"', (): void => {
		expectInterpretErrContains('1U8 - 2', 'out of range');
	});
	it('should interpret "1I8 - 2" as -1', (): void => {
		expectInterpretOk('1I8 - 2', -1);
	});
	it('should interpret "2 + 3 - 4" as 1', (): void => {
		expectInterpretOk('2 + 3 - 4', 1);
	});
	it('should interpret "2 * 3 - 4" as 2', (): void => {
		expectInterpretOk('2 * 3 - 4', 2);
	});
	it('should interpret "4 + 2 * 3" as 10', (): void => {
		expectInterpretOk('4 + 2 * 3', 10);
	});
});

describe('interpret - parentheses and division', (): void => {
	it('should interpret "(4)" as 4', (): void => {
		expectInterpretOk('(4)', 4);
	});
	it('should interpret "(4 + 2) * 3" as 18', (): void => {
		expectInterpretOk('(4 + 2) * 3', 18);
	});
	it('should interpret "1 + (4 + 2) * 3" as 19', (): void => {
		expectInterpretOk('1 + (4 + 2) * 3', 19);
	});
	it('should return Err for "10 / (2 - 2)"', (): void => {
		expectInterpretErrContains('10 / (2 - 2)', 'Division by zero');
	});
});

describe('interpret - blocks', (): void => {
	it('should interpret "{ 7 }" as 7', (): void => {
		expectInterpretOk('{ 7 }', 7);
	});
	it('should interpret "10 / ({ 7 } - 2)" as 2', (): void => {
		expectInterpretOk('10 / ({ 7 } - 2)', 2);
	});
	it('should interpret "{ 2 } * 3 + 1" as 7', (): void => {
		expectInterpretOk('{ 2 } * 3 + 1', 7);
	});
	it('should interpret "1 + { 4 + 2 } * 3" as 19', (): void => {
		expectInterpretOk('1 + { 4 + 2 } * 3', 19);
	});
});

describe('interpret - let bindings and scoping', (): void => {
	it('should interpret "{ let x = 7; x }" as 7', (): void => {
		expectInterpretOk('{ let x = 7; x }', 7);
	});
	it('should interpret "10 / ({ let x = 7; x } - 2)" as 2', (): void => {
		expectInterpretOk('10 / ({ let x = 7; x } - 2)', 2);
	});
	it('should interpret "{ let x = 5; x + 3 }" as 8', (): void => {
		expectInterpretOk('{ let x = 5; x + 3 }', 8);
	});
	it('should interpret "{ let x = 10; let y = 3; x / y }" as 3', (): void => {
		expectInterpretOk('{ let x = 10; let y = 3; x / y }', 3);
	});
	it('should return Err for undefined variable', (): void => {
		expectInterpretErrContains('{ x }', 'Undefined');
	});
});

describe('interpret - type annotations and validation', (): void => {
	it('should interpret "{ let x : I32 = 7; x }" as 7', (): void => {
		expectInterpretOk('{ let x : I32 = 7; x }', 7);
	});
	it('should interpret "10 / ({ let x : I32 = 7; x } - 2)" as 2', (): void => {
		expectInterpretOk('10 / ({ let x : I32 = 7; x } - 2)', 2);
	});
	it('should return Err for out of range typed variable', (): void => {
		expectInterpretErrContains('{ let x : U8 = 256; x }', 'out of range');
	});
	it('should interpret "{ let x : I16 = -100; x }" as -100', (): void => {
		expectInterpretOk('{ let x : I16 = -100; x }', -100);
	});
	it('should interpret "{ let x : U32 = 1000000; x + 1 }" as 1000001', (): void => {
		expectInterpretOk('{ let x : U32 = 1000000; x + 1 }', 1000001);
	});
	it('should return Err for "{ let x : I32 = 7; }" (no expression)', (): void => {
		expectInterpretErrContains('{ let x : I32 = 7; }', 'expression');
	});
	it('should return Err for "10 / ({ let x : I32 = 7; } - 2)"', (): void => {
		expectInterpretErrContains('10 / ({ let x : I32 = 7; } - 2)', 'expression');
	});
	it('should return Err for duplicate variable names', (): void => {
		expectInterpretErrContains('{ let x = 7; let x = 20; x }', 'already defined');
	});
	it('should return Err for "10 / ({ let x = 7; let x = 20; x } - 2)"', (): void => {
		expectInterpretErrContains('10 / ({ let x = 7; let x = 20; x } - 2)', 'already defined');
	});
	it('should interpret "10 / ({ let x = 7; let y = x; y } - 2)" as 2', (): void => {
		expectInterpretOk('10 / ({ let x = 7; let y = x; y } - 2)', 2);
	});
});

describe('interpret - top-level statements', (): void => {
	it('should interpret "let z = 7; z" as 7', (): void => {
		expectInterpretOk('let z = 7; z', 7);
	});
	it('should interpret "let z = 1 + 1; z" as 2', (): void => {
		expectInterpretOk('let z = 1 + 1; z', 2);
	});
	it('should interpret "let z = 10 / ({ let x = 7; let y = x; y } - 2); z" as 2', (): void => {
		expectInterpretOk('let z = 10 / ({ let x = 7; let y = x; y } - 2); z', 2);
	});
	it('should interpret "let x : I32; x = 2; x" as 2', (): void => {
		expectInterpretOk('let x : I32; x = 2; x', 2);
	});
	it('should return Err for uninitialized variable usage', (): void => {
		expectInterpretErrContains('let x : I32; x', 'not initialized');
	});
	it('should interpret "let x : I32; x = 5; x + 3" as 8', (): void => {
		expectInterpretOk('let x : I32; x = 5; x + 3', 8);
	});
});

describe('interpret - mutability', (): void => {
	it('should interpret "let mut x = 0; x = 100; x" as 100', (): void => {
		expectInterpretOk('let mut x = 0; x = 100; x', 100);
	});
	it('should interpret "let mut x = 5; x += 1; x" as 6', (): void => {
		expectInterpretOk('let mut x = 5; x += 1; x', 6);
	});
	it('should interpret "let mut x = 5; x+=1; x" as 6 (no spaces)', (): void => {
		expectInterpretOk('let mut x = 5; x+=1; x', 6);
	});
	it('should interpret "let mut x = 5; x = x + 1; x" as 6', (): void => {
		expectInterpretOk('let mut x = 5; x = x + 1; x', 6);
	});
	it('should interpret "let mut x = 0; x += 1; x" as 1', (): void => {
		expectInterpretOk('let mut x = 0; x += 1; x', 1);
	});
	it('should return Err for "let x = 0; x = 100; x" (immutable)', (): void => {
		expectInterpretErrContains('let x = 0; x = 100; x', 'not mutable');
	});
	it('should return Err for "let x : I32 = 0; x = 100; x = 2; x" (immutable with type)', (): void => {
		expectInterpretErrContains('let x : I32 = 0; x = 100; x = 2; x', 'not mutable');
	});
	it('should interpret "let mut x : I32 = 0; x = 100; x = 2; x" as 2', (): void => {
		expectInterpretOk('let mut x : I32 = 0; x = 100; x = 2; x', 2);
	});
	it('should interpret "let mut x = 0; { x = 100; } x" as 100', (): void => {
		expectInterpretOk('let mut x = 0; { x = 100; } x', 100);
	});
	it('should return Err for "{ let mut x = 0; } x = 100; x" (x only mutable in block scope)', (): void => {
		expectInterpretErrContains('{ let mut x = 0; } x = 100; x', 'Undefined');
	});
	it('should interpret "let x = { let y = 100; y }; x" as 100', (): void => {
		expectInterpretOk('let x = { let y = 100; y }; x', 100);
	});
});

describe('interpret - booleans and if expressions', (): void => {
	it('should interpret "let x : Bool = true; x" as 1', (): void => {
		expectInterpretOk('let x : Bool = true; x', 1);
	});
	it('should interpret "let x : Bool = true; let y : Bool = false; x || y" as 1', (): void => {
		expectInterpretOk('let x : Bool = true; let y : Bool = false; x || y', 1);
	});
	it('should interpret "let x : Bool = true; let y : Bool = false; x && y" as 0', (): void => {
		expectInterpretOk('let x : Bool = true; let y : Bool = false; x && y', 0);
	});
	it('should interpret "if (true) 100 else 200" as 100', (): void => {
		expectInterpretOk('if (true) 100 else 200', 100);
	});
	it('should interpret "if (false) 100 else 200" as 200', (): void => {
		expectInterpretOk('if (false) 100 else 200', 200);
	});
	it('should interpret "let x = if (true) 100 else 200; x" as 100', (): void => {
		expectInterpretOk('let x = if (true) 100 else 200; x', 100);
	});
	it('should interpret "let x = if (false) 100 else 200; x" as 200', (): void => {
		expectInterpretOk('let x = if (false) 100 else 200; x', 200);
	});
	it('should interpret "if (1) 42 else 0" as 42', (): void => {
		expectInterpretOk('if (1) 42 else 0', 42);
	});
	it('should interpret "if (0) 42 else 0" as 0', (): void => {
		expectInterpretOk('if (0) 42 else 0', 0);
	});
	it('should interpret "if (1 + 2) 100 else 50" as 100', (): void => {
		expectInterpretOk('if (1 + 2) 100 else 50', 100);
	});
	it('should interpret nested if-else: "if (true) if (false) 1 else 2 else 3" as 2', (): void => {
		expectInterpretOk('if (true) if (false) 1 else 2 else 3', 2);
	});
});

describe('interpret - if statements and yield', (): void => {
	it('should interpret "let x : I32; if (true) x = 100; else x = 200; x" as 100', (): void => {
		expectInterpretOk('let x : I32; if (true) x = 100; else x = 200; x', 100);
	});
	it('should interpret "let x : I32; if (false) x = 100; else x = 200; x" as 200', (): void => {
		expectInterpretOk('let x : I32; if (false) x = 100; else x = 200; x', 200);
	});
	it('should interpret "let x : I32; if (true) { x = 100; } else { x = 200; } x" as 100', (): void => {
		expectInterpretOk('let x : I32; if (true) { x = 100; } else { x = 200; } x', 100);
	});
	it('should interpret "let x : I32; if (false) { x = 100; } else { x = 200; } x" as 200', (): void => {
		expectInterpretOk('let x : I32; if (false) { x = 100; } else { x = 200; } x', 200);
	});
	it('should interpret "let mut x = 0; if (true) x = 100; x" as 100', (): void => {
		expectInterpretOk('let mut x = 0; if (true) x = 100; x', 100);
	});
	it('should interpret "let mut x = 0; if (false) x = 100; x" as 0', (): void => {
		expectInterpretOk('let mut x = 0; if (false) x = 100; x', 0);
	});
	it('should interpret "{ yield 100; 200 }" as 100', (): void => {
		expectInterpretOk('{ yield 100; 200 }', 100);
	});
	it('should interpret "let x = { yield 100; 200 }; x" as 100', (): void => {
		expectInterpretOk('let x = { yield 100; 200 }; x', 100);
	});
	it('should interpret "let x = { if (true) yield 100; 200 }; x" as 100', (): void => {
		expectInterpretOk('let x = { if (true) yield 100; 200 }; x', 100);
	});
	it('should interpret "let x = { if (false) yield 100; 200 }; x" as 200', (): void => {
		expectInterpretOk('let x = { if (false) yield 100; 200 }; x', 200);
	});
	it('should interpret "{ if (true) yield 100; else yield 200; }" as 100', (): void => {
		expectInterpretOk('{ if (true) yield 100; else yield 200; }', 100);
	});
	it('should interpret "{ if (false) yield 100; else yield 200; }" as 200', (): void => {
		expectInterpretOk('{ if (false) yield 100; else yield 200; }', 200);
	});
});

describe('interpret - chained if-else and match', (): void => {
	it('should interpret "let x = if (false) 100 else if (true) 200 else 300; x" as 200', (): void => {
		expectInterpretOk('let x = if (false) 100 else if (true) 200 else 300; x', 200);
	});
	it('should interpret "if (false) 100 else if (false) 200 else 300" as 300', (): void => {
		expectInterpretOk('if (false) 100 else if (false) 200 else 300', 300);
	});
	it('should interpret "if (true) 100 else if (true) 200 else 300" as 100', (): void => {
		expectInterpretOk('if (true) 100 else if (true) 200 else 300', 100);
	});
	it('should interpret "let x : I32; if (false) x = 100; else x = 200; x" as 200', (): void => {
		expectInterpretOk('let x : I32; if (false) x = 100; else x = 200; x', 200);
	});
	it('should interpret "let x : I32 = match (100) { case 100 => 2; case _ => 3; }; x" as 2', (): void => {
		expectInterpretOk('let x : I32 = match (100) { case 100 => 2; case _ => 3; }; x', 2);
	});
});
