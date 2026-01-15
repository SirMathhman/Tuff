import { interpret } from "./interpret";

// Simple test
try {
  const result = interpret("let array : [I32; 3; 3] = [1, 2, 3]; array[0]");
  console.log("Result:", result);
} catch (e) {
  console.log("Error:", (e as Error).message);
  console.log("Stack:", (e as Error).stack);
}
