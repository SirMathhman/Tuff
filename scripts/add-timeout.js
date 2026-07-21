import { readFileSync, writeFileSync } from "fs";

const content = readFileSync("test/index.test.ts", "utf8");
const lines = content.split("\n");
const updated = lines
  .map((line) => {
    if (line.match(/^test\(/)) {
      return line.replace(/,\s*\(\)\s*=>/, ", { timeout: 5000 }, () =>");
    }
    return line;
  })
  .join("\n");
writeFileSync("test/index.test.ts", updated);
console.log("Done");
