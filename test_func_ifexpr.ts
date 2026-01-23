import { compile } from "./src/app";

const source = "let add = (x : U8, y : U8) => x + y; let multiply = (x : U8, y : U8) => x * y; let chosen = if (read Bool) add else multiply; chosen()";
const result = compile(source);

if (result.ok) {
  console.log("SUCCESS: Compiled");
  console.log("Instructions:", JSON.stringify(result.value, null, 2));
} else {
  console.log("ERROR:", result.error.cause);
  console.log("Reason:", result.error.reason);
  console.log("Fix:", result.error.fix);
}
