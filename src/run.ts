import { interpret } from './interpret.ts';

const input = process.argv[2] ?? 'hello from Bun';
const output = interpret(input);
console.log(output);
