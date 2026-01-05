const fs = require("fs");
const path = require("path");

const summaryPath = path.resolve(
  __dirname,
  "..",
  "coverage",
  "coverage-summary.json"
);
if (!fs.existsSync(summaryPath)) {
  console.error(
    `Coverage summary not found at ${summaryPath}. Run coverage first.`
  );
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const total = summary.total;
const metrics = ["lines", "statements", "functions", "branches"];
let ok = true;

for (const m of metrics) {
  const pct = total[m].pct;
  if (pct !== 100) {
    console.error(`Coverage for ${m} is ${pct}%, but 100% is required.`);
    ok = false;
  } else {
    console.log(`Coverage for ${m} is ${pct}%`);
  }
}

if (!ok) {
  console.error("Coverage check failed: not all metrics at 100%");
  process.exit(1);
}

console.log("All coverage metrics are 100%");
process.exit(0);
