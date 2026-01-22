import { compile } from "./src/app";

// Test just the let binding
const source1 = "let temp : () => I32 = fn get() : I32 => read I32;";
console.log("Test 1 - Just let binding:");
console.log("Source:", source1);
const result1 = compile(source1);
if (result1.ok) {
  console.log("  ✓ OK, instructions:", result1.value.length);
} else {
  console.log("  ✗ Error:", result1.error);
}

// Test function call
const source2 = "let temp : () => I32 = fn get() : I32 => read I32; temp()";
console.log("\nTest 2 - Let binding + function call:");
console.log("Source:", source2);
const result2 = compile(source2);
if (result2.ok) {
  console.log("  ✓ OK, instructions:", result2.value.length);
} else {
  console.log("  ✗ Error:", result2.error);
}

// Test simple function call directly
const source3 = "fn get() : I32 => read I32; get()";
console.log("\nTest 3 - Function definition + call (no let):");
console.log("Source:", source3);
const result3 = compile(source3);
if (result3.ok) {
  console.log("  ✓ OK, instructions:", result3.value.length);
} else {
  console.log("  ✗ Error:", result3.error);
}
