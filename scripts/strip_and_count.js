const fs = require("fs");
let s = fs.readFileSync("src/interpret.ts", "utf8");
s = s.replace(/\/\/.*$/gm, "");
s = s.replace(/\/\*[\s\S]*?\*\//g, "");
s = s.replace(/'(?:\\.|[^'])*'/g, '""');
s = s.replace(/\"(?:\\.|[^\"])*\"/g, '""');
s = s.replace(/`(?:\\.|[^`])*`/g, '""');
s = s.replace(/\/(?:\\.|[^\/\\])+\/[gimuy]*/g, '""');
const c = { "{": 0, "}": 0, "(": 0, ")": 0, "[": 0, "]": 0 };
for (const ch of s) {
  if (ch in c) c[ch]++;
}
console.log(c);
console.log("\n--- snippet around potential issue:");
const idx = s.indexOf("checkAnnMatchesRhs");
console.log(s.slice(idx - 120, idx + 300));
