import { interpret } from "./src";

// Test: Pattern matching with destructuring
console.log("Test: Pattern matching with destructuring");
const test1 = interpret(
  "struct Some { value : I32; } struct None {} type Option = Some | None; let temp : Option = Some { 100 }; match (temp) { case Some { value } => value; case None => 20; }",
);
console.log("Result:", test1, "Expected: 100", test1 === 100 ? "✓" : "✗");
