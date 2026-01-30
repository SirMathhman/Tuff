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
    throw new Error('Memory leak detected: ' + allocated + ' items still allocated.');
  }
}

import fs from 'fs';

export function readContent() {
  // READ the README.md file using fs

  return fs.readFileSync('README.md', 'utf-8');
}

export function println(content: string): void {
  console.log(content);
}
