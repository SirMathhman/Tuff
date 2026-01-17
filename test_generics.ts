import { interpret } from './src/interpret';

const result = interpret('fn pass<T>(value : T) : T => value; pass(100)');
console.log('Generic function test:', JSON.stringify(result));
