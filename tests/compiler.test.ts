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

describe('compiler: error handling', () => {
  test('compile rejects unmatched opening parenthesis', () => {
    assertInvalid('(1 + 2');
  });

  test('compile rejects undefined variable reference', () => {
    assertInvalid('x');
  });

  test('compile rejects invalid numeric literal', () => {
    assertInvalid('100ABC');
  });
});
