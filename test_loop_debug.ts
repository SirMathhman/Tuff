import { compile } from "./src/app";

const source = "let x : Bool = false; x";
console.log("Testing:", source);

const result = compile(source);
if (result.ok) {
  console.log("✅ Compiled, instructions:", result.value.length);
} else {
  console.log("❌ Error:", result.error);
}
