// Tuff Runtime Library
const print = (...args) => console.log(...args);
const input = () => { const fs = require('fs'); return fs.readFileSync(0, 'utf-8').trim(); };
const Ok = (value) => ({ kind: 'Ok', value });
const Err = (error) => ({ kind: 'Err', error });

const Utils = {
  safeDivide(a, b) {
    if ((b === 0)) {
      return Err("Division by zero");
    }
    return Ok((a / b));
  },
  processArray(arr, processor) {
    return arr.map(processor);
  },
};

let numbers = [10, 20, 30, 40, 50];
let doubled = numbers.map(((x) => (x * 2)));
print("Doubled:", doubled);
let result1 = Utils.safeDivide(100, 5);
if ((result1.kind === "Ok")) {
  print("100 / 5 =", result1.value);
}
let result2 = Utils.safeDivide(100, 0);
if ((result2.kind === "Err")) {
  print("Error:", result2.error);
}
let transform = ((x) => (x * 3));
let transformed = Utils.processArray([1, 2, 3], transform);
print("Transformed:", transformed);
function makeMultiplier(factor) {
  return ((x) => (x * factor));
}

let triple = makeMultiplier(3);
let quadruple = makeMultiplier(4);
print("triple(5) =", triple(5));
print("quadruple(5) =", quadruple(5));
let processed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(((x) => ((x % 2) === 0))).map(((x) => (x * x)));
print("Even squares:", processed);