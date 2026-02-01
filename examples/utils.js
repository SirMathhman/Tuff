// Tuff Runtime Library
const print = (...args) => console.log(...args);
const input = () => { const fs = require('fs'); return fs.readFileSync(0, 'utf-8').trim(); };
const Ok = (value) => ({ kind: 'Ok', value });
const Err = (error) => ({ kind: 'Err', error });

const StringUtils = {
  toUpper(s) {
    return s;
  },
  toLower(s) {
    return s;
  },
  repeat(s, n) {
    let result = "";
    for (let i = 0; i < n; i++) {
      (result = (result + s));
    }
    return result;
  },
};

const MathUtils = {
  max(a, b) {
    if ((a > b)) {
      return a;
    }
    return b;
  },
  min(a, b) {
    if ((a < b)) {
      return a;
    }
    return b;
  },
  abs(x) {
    if ((x < 0)) {
      return -x;
    }
    return x;
  },
};

print("MathUtils.max(5, 10) =", MathUtils.max(5, 10));
print("MathUtils.abs(-42) =", MathUtils.abs(-42));
print("StringUtils.repeat('*', 5) =", StringUtils.repeat("*", 5));