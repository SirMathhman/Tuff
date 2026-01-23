import { compile, executeWithArray } from "./src/app";

const source = "let add = (x : U8, y : U8) => x + y; let multiply = (x : U8, y : U8) => x * y; let chosen = if (true) add else multiply; chosen(5U8, 10U8)";
const result = compile(source);

if (result.ok) {
  console.log("SUCCESS: Compiled");
  console.log("Instruction count:", result.value.length);
  const exitCode = executeWithArray(result.value, []);
  console.log("Exit code:", exitCode);
} else {
  console.log("ERROR:", result.error.cause);
  console.log("Reason:", result.error.reason);
}
