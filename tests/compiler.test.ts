import { assertValid, assertInvalid } from './utils';

/**
 * Compiler implementation tests.
 * These tests validate that compile() + execute() produces identical results
 * to the interpreter for basic functionality.
 */

describe('compiler: literals and comments', () => {
  test('compile handles empty input', () => {
    assertValid('', 0);
  });

  test('compile handles simple numeric literal', () => {
    assertValid('100', 100);
  });

  test('compile handles negative numeric literal', () => {
    assertValid('-50', -50);
  });

  test('compile handles zero', () => {
    assertValid('0', 0);
  });
});

describe('compiler: boolean literals', () => {
  test('compile handles true literal', () => {
    assertValid('true', 1);
  });

  test('compile handles false literal', () => {
    assertValid('false', 0);
  });
});

describe('compiler: comments', () => {
  test('compile ignores line comments', () => {
    assertValid('100 // this is ignored\n', 100);
  });

  test('compile ignores block comments', () => {
    assertValid('100 /* this is ignored */', 100);
  });
});

describe('compiler: basic arithmetic', () => {
  test('compile handles addition', () => {
    assertValid('1 + 2', 3);
  });

  test('compile handles subtraction', () => {
    assertValid('10 - 3', 7);
  });

  test('compile handles multiplication', () => {
    assertValid('4 * 5', 20);
  });

  test('compile handles division', () => {
    assertValid('20 / 4', 5);
  });
});

describe('compiler: operator precedence', () => {
  test('compile respects multiplication precedence', () => {
    assertValid('2 + 3 * 4', 14);
  });

  test('compile respects left-to-right evaluation', () => {
    assertValid('10 - 5 - 2', 3);
  });
});

describe('compiler: numeric type suffixes', () => {
  test('compile handles U8 suffix', () => {
    assertValid('100U8', 100);
  });

  test('compile handles I8 suffix', () => {
    assertValid('127I8', 127);
  });

  test('compile handles negative I8 suffix', () => {
    assertValid('-128I8', -128);
  });

  test('compile handles U16 suffix', () => {
    assertValid('65535U16', 65535);
  });

  test('compile rejects U8 overflow', () => {
    assertInvalid('256U8');
  });

  test('compile rejects I8 overflow', () => {
    assertInvalid('128I8');
  });

  test('compile rejects I8 underflow', () => {
    assertInvalid('-129I8');
  });
});

describe('compiler: let statements', () => {
  test('compile handles simple let binding', () => {
    assertValid('let x = 100; x', 100);
  });

  test('compile handles multiple let bindings', () => {
    assertValid('let x = 50; let y = 25; x + y', 75);
  });

  test('compile handles let with type annotation', () => {
    assertValid('let x : I32 = 10; x', 10);
  });

  test('compile handles let with arithmetic', () => {
    assertValid('let x = 2 + 3; let y = 4 * 5; x + y', 25);
  });

  test('compile handles mutable let binding', () => {
    assertValid('let mut x = 5; x = 10; x', 10);
  });

  test('compile handles compound assignment', () => {
    assertValid('let mut x = 5; x += 3; x', 8);
  });

  test('compile rejects undefined variable', () => {
    assertInvalid('let x = y + 1; x');
  });

  test('compile rejects reassignment of immutable var', () => {
    assertInvalid('let x = 5; x = 10; x');
  });
});

describe('compiler: comparisons', () => {
  test('compile handles equality', () => {
    assertValid('5 == 5', 1);
  });

  test('compile handles inequality for equal values', () => {
    assertValid('5 != 5', 0);
  });

  test('compile handles inequality for different values', () => {
    assertValid('5 != 3', 1);
  });

  test('compile handles less than', () => {
    assertValid('3 < 5', 1);
  });

  test('compile handles greater than', () => {
    assertValid('5 > 3', 1);
  });

  test('compile handles less than or equal', () => {
    assertValid('5 <= 5', 1);
  });

  test('compile handles greater than or equal', () => {
    assertValid('5 >= 3', 1);
  });

  test('compile comparisons with variables', () => {
    assertValid('let x = 5; let y = 3; x > y', 1);
  });
});

describe('compiler: boolean operators', () => {
  test('compile handles logical AND true', () => {
    assertValid('true && true', 1);
  });

  test('compile handles logical AND with one false', () => {
    assertValid('true && false', 0);
  });

  test('compile handles logical OR true', () => {
    assertValid('false || true', 1);
  });

  test('compile handles logical OR both false', () => {
    assertValid('false || false', 0);
  });

  test('compile handles boolean operators with comparisons', () => {
    assertValid('5 > 3 && 2 < 4', 1);
  });

  test('compile handles AND/OR chaining', () => {
    assertValid('true && true && false', 0);
  });

  test('compile handles OR with multiple values', () => {
    assertValid('false || false || true', 1);
  });
});

describe('compiler: if/else expressions', () => {
  test('compile handles if with true condition', () => {
    assertValid('if (true) 10 else 20', 10);
  });

  test('compile handles if with false condition', () => {
    assertValid('if (false) 10 else 20', 20);
  });

  test('compile handles if with comparison condition', () => {
    assertValid('if (5 > 3) 100 else 200', 100);
  });

  test('compile handles nested if expressions', () => {
    assertValid('if (true) if (false) 10 else 20 else 30', 20);
  });

  test('compile handles if with variable condition', () => {
    assertValid('let x = 5; if (x > 3) 1 else 0', 1);
  });

  test('compile handles chained if/else-if', () => {
    assertValid('if (false) 1 else if (true) 2 else 3', 2);
  });

  test('compile handles if with arithmetic in branches', () => {
    assertValid('if (true) 2 + 3 else 4 + 5', 5);
  });

  test('compile handles if with boolean results', () => {
    assertValid('if (true) true else false', 1);
  });
});

describe('compiler: error handling', () => {
  test('compile rejects unmatched opening parenthesis', () => {
    assertInvalid('(1 + 2');
  });

  test('compile rejects undefined variable reference', () => {
    assertInvalid('x');
  });
});
