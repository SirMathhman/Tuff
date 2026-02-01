// Tuff Runtime Library
const print = (...args) => console.log(...args);
const input = () => { const fs = require('fs'); return fs.readFileSync(0, 'utf-8').trim(); };
const Ok = (value) => ({ kind: 'Ok', value });
const Err = (error) => ({ kind: 'Err', error });

let double = ((x) => (x * 2));
print("double(5) =", double(5));
let add = ((a, b) => (a + b));
print("add(3, 7) =", add(3, 7));
let greet = (() => "Hello!");
print("greet() =", greet());
function makeCounter() {
  let count = 0;
  return (() => { (count = (count + 1)); return count; });
}

let counter = makeCounter();
print("counter() =", counter());
print("counter() =", counter());
print("counter() =", counter());