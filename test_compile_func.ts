import { compile } from "./src/app";

const source = "let temp : () => I32 = fn get() : I32 => read I32; temp()";
console.log("Compiling:", source);

const result = compile(source);
console.log("\nCompilation result:");
if (result.ok) {
  console.log("✓ OK");
  console.log("  Instructions count:", result.value.length);
  if (result.value.length === 0) {
    console.log("  ❌ ERROR: Empty instruction list!");
  }
  console.log("  Instructions:", JSON.stringify(result.value.slice(0, 3)));
} else {
  console.log("✗ Error:", result.error);
}
