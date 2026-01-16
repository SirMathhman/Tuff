import { interpret } from './src/interpret';

// Step by step
const result1 = interpret('let x : I32; x = 100; x');
console.log('Assignment only:', result1);

const result2 = interpret('let x : I32; if (true) x = 100; else x = 200; x');
console.log('If-else statement:', result2);

const result3 = interpret('let x : I32 = 100; x');
console.log('Init with value:', result3);
