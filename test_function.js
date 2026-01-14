// Quick test for function feature
import { interpret } from './src/interpret.ts';

try {
  const result = interpret('fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)');
  console.log('Function call result:', result);
  console.log('Expected: 7');
  console.log('Test', result === 7 ? 'PASSED' : 'FAILED');
} catch (e) {
  console.error('Error:', e.message);
}
