import { interpret } from "./src";

// Test 1: Numeric pattern matching (should still work)
console.log("Test 1: Numeric pattern matching");
const test1 = interpret("let x = match (100) { case 100 => 2; case _ => 3; }; x");
console.log("Result:", test1, "Expected: 2", test1 === 2 ? "✓" : "✗");
console.log();

// Test 2: Struct variant pattern matching (new feature)
console.log("Test 2: Struct variant pattern matching");
const test2 = interpret(
  "struct Some { value : I32; } struct None {} type Option = Some | None; let temp : Option = Some { 100 }; match (temp) { case Some => temp.value; case None => 20; }"
);
console.log("Result:", test2, "Expected: 100", test2 === 100 ? "✓" : "✗");
