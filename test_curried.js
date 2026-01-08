import { interpret } from './src/interpret.ts';

try {
  const result = interpret("fn outer(first : I32) => fn inner(second : I32) => first + second; outer(3)(4)");
  console.log("Result:", result);
} catch (e) {
  console.error("Error:", e.message);
  console.error("Stack:", e.stack);
}
