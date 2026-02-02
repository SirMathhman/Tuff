import { interpret } from "./src";

console.log("Test 1 - Struct + field access:");
const result1 = interpret("struct Point { x : I32; y : I32; } let temp : Point = Point { 3, 4 }; temp.x + temp.y");
console.log("Result:", result1, "Expected: 7");
