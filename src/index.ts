import { add } from './utils';

console.log('Hello from TypeScript!');
console.log(`2 + 3 = ${add(2, 3)}`);

export function greet(name: string) {
  return `Hello, ${name}!`;
}
