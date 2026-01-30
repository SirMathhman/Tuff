// This file is expected to change substantially and should not be depended on for tests.

let allocated = 0;

export function alloc<T>(length: number): T[] {
  allocated += length;
  return new Array<T>(length);
}

export function free<T>(toFree: T[]) {
  allocated -= toFree.length;
}

export function checkMemoryOrPanic() {
  if (allocated !== 0) {
    throw new Error('Memory leak detected: ' + allocated + ' items still allocated. Compiled code did not free all allocated memory as expected.');
  }
}

import * as fs from 'fs';

export function readContent() {
  // READ the README.md file using fs

  return fs.readFileSync('README.md', 'utf-8');
}

export function println(content: string): void {
  console.log(content);
}

// This should be similar to C's snprintf_s (use the secure function as a model, don't use the insecure one).
export function format(msg: string, ...args: unknown[]): string {
  // Example invocation: format("Expected '%s', but was actually '%s'.", expectedValue, actualValue)
  // This is a trivial and nonrobust implementation.
  let formatted = msg;
  for (let i = 0; i < args.length; i++) {
    const placeholder = '%s';
    const argStr = String(args[i]);
    formatted = formatted.replace(placeholder, argStr);
  }

  return formatted;
}
