import { compile } from "./src/app";

const source = "let x : Bool = false; x";
console.log("Testing:", source);
console.time("compile");
const result = compile(source);
console.timeEnd("compile");
if (result.ok) {
  console.log("✅ Compiled, instructions:", result.value.length);
} else {
  console.log("❌ Error:", result.error);
}
