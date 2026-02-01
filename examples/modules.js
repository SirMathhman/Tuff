// Tuff Runtime Library
const print = (...args) => console.log(...args);
const input = () => { const fs = require('fs'); return fs.readFileSync(0, 'utf-8').trim(); };
const Ok = (value) => ({ kind: 'Ok', value });
const Err = (error) => ({ kind: 'Err', error });

const Math = {
  square(x) {
    return (x * x);
  },
  cube(x) {
    return ((x * x) * x);
  },
};

const String = {
  reverse(s) {
    return s;
  },
};

print("Math.square(5) =", Math.square(5));
print("Math.cube(3) =", Math.cube(3));