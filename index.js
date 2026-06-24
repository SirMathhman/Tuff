import * as fs from "node/fs/promises";

export function compileTuffToJS(source) {
  throw new Error("Invalid source: " + source);
}

// This might be broken a little
const source = await fs.readString("./main.tuff");
const target = compileTuffToJS(source);
await fs.writeString("./main.js", target);
