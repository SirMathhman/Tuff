import { interpret } from "./src";

// Test 1: Basic numeric is operator
console.log("Test 1: '100 is I32'");
const test1 = interpret("100 is I32");
console.log("Result:", test1, "Expected: 1", test1 === 1 ? "✓" : "✗");
console.log();

// Test 2: Combined is operators
console.log("Test 2: '(100 is I32) && (100 is I32)'");
const test2 = interpret("(100 is I32) && (100 is I32)");
console.log("Result:", test2, "Expected: 1", test2 === 1 ? "✓" : "✗");
console.log();

// Test 3: Union type struct check
console.log("Test 3: Union type struct instance check");
const test3 = interpret(
  "struct Some { value : I32; } struct None {} type Option = Some | None; let temp : Option = Some { 100 }; temp is Some",
);
console.log("Result:", test3, "Expected: 1", test3 === 1 ? "✓" : "✗");
