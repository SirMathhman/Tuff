import { describe, it, expect } from 'bun:test';
import { interpret } from '../src/interpret';

describe('interpret', () => {
  it('parses simple integer string', () => {
    expect(interpret('100')).toBe(100);
  });

  it('parses integer with U8 type suffix', () => {
    expect(interpret('100U8')).toBe(100);
  });

  it('rejects negative numbers with unsigned type suffix', () => {
    expect(() => interpret('-100U8')).toThrow('Invalid number: -100U8');
  });

  it('parses negative integer with signed I8 type suffix', () => {
    expect(interpret('-100I8')).toBe(-100);
  });

  it('rejects value out of range for U8', () => {
    expect(() => interpret('256U8')).toThrow('Invalid number: 256U8');
  });

  it('evaluates simple addition with type suffixes', () => {
    expect(interpret('1U8 + 2U8')).toBe(3);
  });

  it('rejects expression result out of range for U8', () => {
    expect(() => interpret('1U8 + 255U8')).toThrow(
      'Invalid expression: 1U8 + 255U8'
    );
  });

  it('allows mixing typed and untyped operands when result fits', () => {
    expect(interpret('1U8 + 254')).toBe(255);
  });

  it('rejects result out of range when mixing typed and untyped operands', () => {
    expect(() => interpret('1U8 + 255')).toThrow(
      'Invalid expression: 1U8 + 255'
    );
  });

  it('rejects expressions with mismatched type suffixes', () => {
    expect(() => interpret('1U8 + 65535U16')).toThrow(
      'Invalid expression: 1U8 + 65535U16'
    );
  });

  it('allows different unsigned type suffixes when result fits widest type', () => {
    expect(interpret('1U8 + 255U16')).toBe(256);
  });

  it('evaluates multiple operands with mixed types and untyped numbers', () => {
    expect(interpret('1U8 + 2 + 3U16')).toBe(6);
  });

  it('evaluates multiple addition and subtraction with signed types', () => {
    expect(interpret('2I8 + 3I8 - 4I8')).toBe(1);
  });

  it('evaluates expression with multiplication and subtraction', () => {
    expect(interpret('2I8 * 3I8 - 4I8')).toBe(2);
  });

  it('respects operator precedence (* before +)', () => {
    expect(interpret('1I8 + 2I8 * 3I8')).toBe(7);
  });

  it('respects operator precedence for untyped numbers', () => {
    expect(interpret('4 + 2 * 3')).toBe(10);
  });

  it('supports parentheses to override precedence', () => {
    expect(interpret('(4 + 2) * 3')).toBe(18);
  });

  it('supports curly braces for grouping', () => {
    expect(interpret('(4 + { 2 }) * 3')).toBe(18);
  });

  it('supports let declarations in block expressions', () => {
    expect(interpret('(4 + { let x : I32 = 2; x }) * 3')).toBe(18);
  });

  it('supports multiple let declarations and variable usage in expressions', () => {
    expect(interpret('{ let x : U8 = 10; let y : U8 = 20; x + y }')).toBe(30);
  });

  it('supports using previously defined variables in new let declarations', () => {
    expect(interpret('(4 + { let x : I32 = 2; let y : I32 = x; y }) * 3')).toBe(
      18
    );
  });

  it('rejects re-declaring variables in the same block', () => {
    expect(() =>
      interpret('(4 + { let x : I32 = 2; let x : I32 = 100; x }) * 3')
    ).toThrow('Variable already declared: x');
  });

  it('supports assigning a smaller typed value to a larger type', () => {
    expect(interpret('(4 + { let x : U16 = 2U8; x }) * 3')).toBe(18);
  });

  it('rejects assigning a larger typed value to a smaller type', () => {
    expect(() => interpret('(4 + { let x : U8 = 2U16; x }) * 3')).toThrow(
      'Invalid type: let x : U8 = 2U16'
    );
  });

  it('supports inferred let declarations', () => {
    expect(interpret('(4 + { let x = 2U8; let y : U16 = x; y }) * 3')).toBe(18);
  });

  it('rejects narrowing assignment from an inferred variable', () => {
    expect(() =>
      interpret('(4 + { let x = 2U16; let y : U8 = x; y }) * 3')
    ).toThrow('Invalid type: let y : U8 = x');
  });

  it('supports complex expressions with let and blocks returning a result', () => {
    expect(interpret('let y : U8 = (4 + { let x = 2U8; x }) * 3; y')).toBe(18);
  });

  it('supports mutable variables and re-assignment', () => {
    expect(interpret('let mut x = 0; x = 1; x')).toBe(1);
  });
  it('supports compound assignment operators', () => {
    expect(interpret('let mut x = 1; x += 2; x')).toBe(3);
    expect(interpret('let mut x = 10; x -= 2; x')).toBe(8);
    expect(interpret('let mut x = 3; x *= 4; x')).toBe(12);
    expect(interpret('let mut x = 20; x /= 5; x')).toBe(4);
  });
  it('allows re-assignment to outer scope mutable variables from inner blocks', () => {
    expect(interpret('let mut x = 0; { x = 1; }; x')).toBe(1);
  });

  it('supports empty blocks', () => {
    expect(interpret('let mut x = 0; {} x')).toBe(0);
  });

  it('rejects re-assignment to immutable variables', () => {
    expect(() => interpret('let x = 0; x = 1')).toThrow(
      'Cannot assign to immutable variable: x'
    );
    expect(() => interpret('let x = 0; x = 1; x')).toThrow(
      'Cannot assign to immutable variable: x'
    );
  });

  it('rejects shadowing of variables in inner scopes', () => {
    expect(() => interpret('let x = 0; let y = { let x = 0; x }; y')).toThrow(
      'Variable already declared: x'
    );
  });

  it('supports declarations without initializers and delayed initialization', () => {
    expect(interpret('let x : U8; x = 100; x')).toBe(100);
  });

  it('rejects second assignment to an immutable variable after delayed initialization', () => {
    expect(() => interpret('let x : U8; x = 100; x = 10; x')).toThrow(
      'Cannot assign to immutable variable: x'
    );
  });

  it('supports multiple assignments to a mutable variable with delayed initialization', () => {
    expect(interpret('let mut x : U8; x = 100; x = 10; x')).toBe(10);
  });

  it('rejects reading from an uninitialized variable', () => {
    expect(() => interpret('let x : U8; x')).toThrow(
      'Use of uninitialized variable: x'
    );
  });

  it('rejects out-of-range values during delayed initialization', () => {
    expect(() => interpret('let x : U8; x = 256; x')).toThrow(
      'Invalid number: x = 256'
    );
  });

  it('supports Bool type and boolean literals', () => {
    expect(interpret('let temp : Bool = true; temp')).toBe(1);
    expect(interpret('let temp : Bool = false; temp')).toBe(0);
  });

  it('rejects assigning Bool to an integer type', () => {
    expect(() =>
      interpret('let temp = true; let other : I32 = temp; other')
    ).toThrow('Invalid type: let other : I32 = temp');
  });

  it('rejects arithmetic operators on Bool values', () => {
    expect(() => interpret('true + false')).toThrow(
      'Arithmetic operators not supported for Bool: true + false'
    );
  });

  it('supports if-else expressions', () => {
    expect(interpret('let test : U8 = if (true) 2 else 3; test')).toBe(2);
    expect(interpret('let test : U8 = if (false) 2 else 3; test')).toBe(3);
    expect(interpret('if (true) { 10 } else { 20 }')).toBe(10);
    expect(interpret('if (false) 1 else if (false) 2 else 3')).toBe(3);
    expect(interpret('let x : U8; if (true) x = 1; else x = 2; x')).toBe(1);
    expect(
      interpret('let x : U8; if (true) { x = 1; } else { x = 2; } x')
    ).toBe(1);
    expect(
      interpret(
        'let x : U8; if (false) x = 1; else if (false) x = 2; else x = 3; x'
      )
    ).toBe(3);
  });

  it('rejects mismatched branch types in if-else expressions', () => {
    expect(() => interpret('if (true) 2 else true')).toThrow(
      'Mismatched branch types in if-else'
    );
  });

  it('rejects assigning numeric if-else result to Bool', () => {
    expect(() =>
      interpret('let result : Bool = if (true) 2 else 3; result')
    ).toThrow('Invalid number: let result : Bool = 2');
  });

  it('supports logical operators on Bool values', () => {
    expect(interpret('true || false')).toBe(1);
    expect(interpret('true && false')).toBe(0);
    expect(interpret('true && true')).toBe(1);
    expect(interpret('false || false')).toBe(0);
  });

  it('respects logical operator precedence (&& before ||)', () => {
    expect(interpret('true || false && false')).toBe(1);
    expect(interpret('false && true || true')).toBe(1);
    expect(interpret('false && (true || true)')).toBe(0);
  });

  it('rejects logical operators on non-boolean types', () => {
    expect(() => interpret('1 || 2')).toThrow(
      'Logical operators only supported for Bool: 1 || 2'
    );
    expect(() => interpret('true && 1')).toThrow(
      'Logical operators only supported for Bool: true && 1'
    );
  });

  it('supports comparison operators', () => {
    expect(interpret('100 < 200')).toBe(1);
    expect(interpret('200 < 100')).toBe(0);
    expect(interpret('100 <= 100')).toBe(1);
    expect(interpret('100 > 50')).toBe(1);
    expect(interpret('50 >= 50')).toBe(1);
    expect(interpret('100 == 100')).toBe(1);
    expect(interpret('100 != 200')).toBe(1);
    expect(interpret('let x = 100; let y = 200; x < y')).toBe(1);
  });

  describe('arrays', () => {
    it('supports array literals and indexing', () => {
      expect(
        interpret(
          'let array : [I32; 3; 3] = [1, 2, 3]; array[0] + array[1] + array[2]'
        )
      ).toBe(6);
    });
  });

  describe('pointers', () => {
    it('supports address-of and dereference', () => {
      expect(interpret('let x = 100; let y : *Untyped = &x; *y')).toBe(100);
      expect(interpret('let x : I32 = 42; let y : *I32 = &x; *y')).toBe(42);
    });

    it('supports re-assignment of the pointed-to variable', () => {
      expect(interpret('let mut x = 1; let y = &x; x = 2; *y')).toBe(2);
    });

    it('rejects dereferencing non-pointer types', () => {
      expect(() => interpret('let x = 100; *x')).toThrow(
        'Cannot dereference non-pointer type'
      );
    });

    it('rejects taking address of undeclared variable', () => {
      expect(() => interpret('&z')).toThrow(
        'Cannot take address of undeclared variable: z'
      );
    });

    it('rejects dereferencing uninitialized memory', () => {
      expect(() => interpret('let x : I32; let y = &x; *y')).toThrow(
        'Use of uninitialized memory at: *y'
      );
    });

    it('supports nested pointers', () => {
      expect(interpret('let x = 100; let y = &x; let z = &y; **z')).toBe(100);
    });

    it('supports assignment via mutable pointers', () => {
      expect(
        interpret('let mut x = 0; let y : *mut I32 = &x; *y = 100; x')
      ).toBe(100);
    });

    it('rejects assignment via immutable pointers', () => {
      expect(() =>
        interpret('let mut x = 0; let y : *I32 = &x; *y = 100; x')
      ).toThrow('Cannot assign through immutable pointer');
    });
  });

  describe('match expressions', () => {
    it('supports basic matching with literals', () => {
      expect(
        interpret('match (100) { case 100 => 1; case 200 => 2; case _ => 3; }')
      ).toBe(1);
      expect(
        interpret('match (200) { case 100 => 1; case 200 => 2; case _ => 3; }')
      ).toBe(2);
    });

    it('supports type suffixes in patterns', () => {
      expect(interpret('match (100U8) { case 100U8 => 1; case _ => 2; }')).toBe(
        1
      );
      expect(
        interpret('match (100U8) { case 100I32 => 1; case _ => 2; }')
      ).toBe(1);
    });

    it('supports wildcard matching', () => {
      expect(
        interpret('match (300) { case 100 => 1; case 200 => 2; case _ => 3; }')
      ).toBe(3);
    });

    it('rejects when no match is found and no wildcard is provided', () => {
      expect(() =>
        interpret('match (100) { case 200 => 2; case 300 => 3; }')
      ).toThrow('No match found and no wildcard provided');
      expect(() =>
        interpret('let x = match (100) { case 300 => 1; case 200 => 2; }; x')
      ).toThrow('No match found and no wildcard provided');
      expect(() => interpret('let x = match (100) {}; x')).toThrow(
        'No match found and no wildcard provided'
      );
    });

    it('supports match expressions with side effects in branches', () => {
      expect(
        interpret(
          'let mut x = 0; match (1) { case 1 => x = 10; case _ => x = 20; }; x'
        )
      ).toBe(10);
      expect(
        interpret(
          'let mut x = 0; match (2) { case 1 => x = 10; case _ => x = 20; }; x'
        )
      ).toBe(20);
    });

    it('only executes the matched branch', () => {
      expect(
        interpret(
          'let mut x = 0; match (1) { case 1 => 1; case _ => x = 10; }; x'
        )
      ).toBe(0);
    });

    it('can be used in assignments', () => {
      expect(
        interpret('let x = match (100) { case 100 => 1; case _ => 2; }; x')
      ).toBe(1);
    });

    it('supports complex expressions in branches', () => {
      expect(
        interpret('match (100) { case 100 => 1 + 2 * 3; case _ => 0; }')
      ).toBe(7);
    });

    it('requires at least one branch to match', () => {
      expect(() => interpret('match (100) { case 200 => 1; }')).toThrow(
        'No match found and no wildcard provided'
      );
    });

    it('enforces type compatibility between branches', () => {
      expect(() =>
        interpret('match (100) { case 100 => 1; case _ => true; }')
      ).toThrow('Mismatched branch types in match');
      expect(() =>
        interpret('match (100) { case 100 => 1U8; case _ => 1I8; }')
      ).toThrow('Mismatched branch types in match');
    });

    it('supports nested match expressions', () => {
      const code =
        'match (1) {\n' +
        '  case 1 => match (2) {\n' +
        '    case 2 => 10;\n' +
        '    case _ => 20;\n' +
        '  };\n' +
        '  case _ => 30;\n' +
        '}';
      expect(interpret(code)).toBe(10);
    });
  });
});
