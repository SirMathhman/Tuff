// JavaScript implementation of memory operations

function malloc(size) {
  // In JS, we just return a new array buffer
  return new Uint8Array(size);
}

function realloc(ptr, newSize) {
  // Create new array with new size and copy old data
  const newPtr = new Uint8Array(newSize);
  if (ptr) {
    newPtr.set(ptr.slice(0, Math.min(ptr.length, newSize)));
  }
  return newPtr;
}

function free(ptr) {
  // JavaScript has garbage collection, no explicit cleanup needed
}

function exit(code) {
  process.exit(code);
}

module.exports = { malloc, realloc, free, exit };
