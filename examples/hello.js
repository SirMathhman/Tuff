// Tuff Runtime Library
const print = (...args) => console.log(...args);
const input = () => { const fs = require('fs'); return fs.readFileSync(0, 'utf-8').trim(); };

function main() {
  print("Hello, World!");
}

main();