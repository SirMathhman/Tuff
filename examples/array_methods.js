// Tuff Runtime Library
const print = (...args) => console.log(...args);
const input = () => { const fs = require('fs'); return fs.readFileSync(0, 'utf-8').trim(); };
const Ok = (value) => ({ kind: 'Ok', value });
const Err = (error) => ({ kind: 'Err', error });

let numbers = [1, 2, 3, 4, 5];
let doubled = numbers.map(((x) => (x * 2)));
print("doubled:", doubled);
let evens = numbers.filter(((x) => ((x % 2) === 0)));
print("evens:", evens);
print("Printing each number:");
numbers.forEach(((x) => print("  -", x)));
let result = [10, 20, 30, 40, 50].map(((x) => (x / 10))).filter(((x) => (x > 2)));
print("chained result:", result);