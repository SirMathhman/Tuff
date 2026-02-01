// Tuff Runtime Library
const print = (...args) => console.log(...args);
const input = () => { const fs = require('fs'); return fs.readFileSync(0, 'utf-8').trim(); };

function factorial(n) {
  if ((n <= 1)) {
    return 1;
  }
  return (n * factorial((n - 1)));
}

print(factorial(5));
print(factorial(10));