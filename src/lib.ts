// This file is expected to change substantially and should not be depended on for tests.

export function createArray<T>(length: number): T[] {
  return new Array<T>(length);
}

const fs = require('fs');

export function readContent() {
  // READ the README.md file using fs

  return fs.readFileSync('README.md', 'utf-8');
}
