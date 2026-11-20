import { err, ok, type Result } from "./src/result";

/**
 * Interprets a Tuff program and returns its result.
 *
 * @param tuffSource - The Tuff source text to interpret.
 * @returns An Ok result with the numeric result of the program, or an Err result describing what is wrong, where, why, and how to fix it.
 */
export function interpretTuff(tuffSource: string): Result<number, string> {
  const source = tuffSource.trim();
  if (/^\d+$/.test(source)) {
    return ok(Number(source));
  }
  if (/^\d+(\s*\+\s*\d+)+$/.test(source)) {
    const sum = source
      .split("+")
      .reduce((total, term) => total + Number(term.trim()), 0);
    return ok(sum);
  }
  return err(describeUnsupported(tuffSource));
}

/**
 * Builds an error message that states what is wrong, where it is, why it is
 * rejected, and how to fix it.
 *
 * @param tuffSource - The untrimmed source that failed to parse.
 * @returns A multi-part message naming the location of the first offending character.
 */
function describeUnsupported(tuffSource: string): string {
  const { offset, expected } = findFirstUnsupported(tuffSource);
  const { line, column } = locate(tuffSource, offset);
  const found =
    offset < tuffSource.length
      ? `"${tuffSource.charAt(offset)}"`
      : "end of input";
  return (
    `What: unsupported Tuff source. ` +
    `Where: line ${line}, column ${column}, found ${found} where ${expected} was expected. ` +
    `Why: Tuff currently only evaluates non-negative integer literals and sums of them joined by "+". ` +
    `Fix: change the source to a form such as "1" or "1 + 2" (received ${JSON.stringify(tuffSource)}).`
  );
}

/**
 * Scans the source against the grammar `number ("+" number)*` and finds the
 * first character that breaks it.
 *
 * @param tuffSource - The source to scan.
 * @returns The zero-based offset of the failure and a description of what was expected there.
 */
function findFirstUnsupported(tuffSource: string): {
  offset: number;
  expected: string;
} {
  let expectTerm = true;
  let i = 0;
  while (i < tuffSource.length) {
    const c = tuffSource.charAt(i);
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (expectTerm) {
      if (!/\d/.test(c)) {
        return { offset: i, expected: "a number" };
      }
      while (i < tuffSource.length && /\d/.test(tuffSource.charAt(i))) {
        i++;
      }
      expectTerm = false;
    } else {
      if (c !== "+") {
        return { offset: i, expected: `"+" or end of input` };
      }
      i++;
      expectTerm = true;
    }
  }
  if (expectTerm) {
    return { offset: tuffSource.length, expected: "a number" };
  }
  // Unreachable when called with a source the grammar rejects; kept as a safe fallback.
  return { offset: tuffSource.length, expected: "a valid expression" };
}

/**
 * Converts a zero-based offset into a one-based line and column.
 *
 * @param text - The text containing the offset.
 * @param offset - The zero-based offset to locate.
 * @returns The one-based line and column of the offset.
 */
function locate(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charAt(i) === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}
