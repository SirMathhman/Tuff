import { compile } from "./src/app";

// Test just the "chosen" variable without if-expression
const source = "let add = (x : U8, y : U8) => x + y; let chosen = add; chosen()";
const result = compile(source);

if (result.ok) {
  console.log("SUCCESS: Compiled");
  console.log("Instruction count:", result.value.length);
} else {
  console.log("ERROR:", result.error.cause);
}
