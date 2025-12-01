// io.js - JavaScript implementation
// Maps to extern functions in io.tuff

export function print(message) {
  process.stdout.write(message);
}

export function println(message) {
  console.log(message);
}

// Make functions globally available for compiled Tuff code
globalThis.print = print;
globalThis.println = println;
