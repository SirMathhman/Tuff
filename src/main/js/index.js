import * as fs from "fs/promises";
import { compile } from "./compile";

async function run() {
  const source = await fs.readFile("./src/main/tuff/lib.tuff");
  const target = compile(source);
  await fs.writeFile("./dist/lib.js", target);
}

run().catch((e) => console.error(e));
