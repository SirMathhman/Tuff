import { parseLetComponents } from "./src/support/let-binding";

const source = "let temp : () => I32 = fn get() : I32 => read I32; temp()";
const result = parseLetComponents(source);
console.log("Result:", JSON.stringify(result, null, 2));
