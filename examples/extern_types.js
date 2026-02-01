// Tuff Runtime Library
const print = (...args) => console.log(...args);
const input = () => { const fs = require('fs'); return fs.readFileSync(0, 'utf-8').trim(); };
const Ok = (value) => ({ kind: 'Ok', value });
const Err = (error) => ({ kind: 'Err', error });

// extern type Map
// extern type Set
// extern type Date
print("Extern types declared: Map, Set, Date");