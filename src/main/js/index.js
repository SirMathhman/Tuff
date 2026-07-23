import * as fs from "fs/promises";
import { compile } from "./compile";

async function run() {
  const source = await fs.readFile("./src/main/tuff/lib.tuff");
  const target = compile(source);
  if (target.ok) {
    await fs.writeFile("./dist/lib.js", target.value);
  } else {
    console.error(target.error);
  }
}

run().catch((e) => console.error(e));
