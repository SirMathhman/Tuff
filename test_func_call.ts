import { compile, executeWithArray } from "./src/app";

const source = "let add = (x : U8, y : U8) => x + y; add(5U8, 10U8)";
const result = compile(source);

if (result.ok) {
  console.log("SUCCESS: Compiled");
  const exitCode = executeWithArray(result.value, []);
  console.log("Exit code:", exitCode);
} else {
  console.log("ERROR:", result.error.cause);
}
