import { interpret } from "./src/utils/interpret";

try {
  const result = interpret("let func : () => I32 = () => 100; func()");
  console.log("Result:", result);
  console.log("Test:", result === 100 ? "PASS" : "FAIL");
} catch (e) {
  console.log("Error:", (e as Error).message);
}
