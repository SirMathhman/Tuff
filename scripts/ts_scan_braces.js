const fs = require("fs");
const ts = require("typescript");
const s = fs.readFileSync("src/interpret.ts", "utf8");
const scanner = ts.createScanner(
  ts.ScriptTarget.ES2020,
  false,
  ts.LanguageVariant.Standard,
  s
);
let token;
const stack = [];
while ((token = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
  if (token === ts.SyntaxKind.OpenBraceToken)
    stack.push({ token, pos: scanner.getTokenPos() });
  else if (token === ts.SyntaxKind.CloseBraceToken) {
    if (stack.length === 0) {
      console.log("Unmatched } at", scanner.getTokenPos());
      process.exit(0);
    }
    stack.pop();
  }
}
if (stack.length) {
  console.log(
    "Unclosed { at EOF, count",
    stack.length,
    "examples",
    stack.map((x) => x.pos).slice(-5)
  );
} else console.log("All {} balanced");
