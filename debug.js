import { interpret } from "./src/interpret.js";

try {
  console.log("Starting test...");
  const result = interpret("(2 + 4) * 3");
  console.log("Result:", result);
} catch (e) {
  console.error("Error:", e);
}
