// JavaScript implementation of memory operations

function malloc(size) {
  // In JS, we just return a new array buffer
  return new Uint8Array(size);
}

function free(ptr) {
  // JavaScript has garbage collection, no explicit cleanup needed
}

function exit(code) {
  process.exit(code);
}

module.exports = { malloc, free, exit };
