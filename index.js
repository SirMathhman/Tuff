import * as fs from "fs/promises";

export function compileTuffToJS(source) {
  throw new Error("Invalid source: " + source);
}

// This might be broken a little
const source = await fs.readFile("./main.tuff", "utf-8");
const target = compileTuffToJS(source);
await fs.writeFile("./main.js", target, "utf-8");
