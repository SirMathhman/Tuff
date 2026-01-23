import { parseLetComponents } from "./src/support/let-binding";

const source = "let temp : () => I32 = fn get() : I32 => read I32; temp()";
console.log("Testing:", source);

const result = parseLetComponents(source);
console.log("\nParsed result:");
console.log(JSON.stringify(result, null, 2));

if (result) {
  console.log("\n✓ varName:", result.varName);
  console.log("✓ typeAnnotation:", result.typeAnnotation);
  console.log("✓ exprPart:", result.exprPart);
  console.log("✓ remaining:", result.remaining);

  // Validate
  const isCorrect =
    result.varName === "temp" &&
    result.typeAnnotation === "() => I32" &&
    result.exprPart.startsWith("fn get()");

  console.log(
    "\n" +
      (isCorrect ? "✅ PASS: Parsing fixed!" : "❌ FAIL: Still has issues"),
  );
} else {
  console.log("❌ FAIL: parseLetComponents returned undefined");
}
