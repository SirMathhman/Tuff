import * as fs from "fs/promises";
import { compile } from "./compile";

async function run() {
  const source = await fs.readFile("./src/main/tuff/lib.tuff", "utf-8");
  const target = compile(source);
  if (target.ok) {
    const content = "const __args__ = process.argv;\nprocess.exit(() => {\n" + target.value + "\n});";
    await fs.writeFile("./dist/lib.js", content, "utf-8");
  } else {
    console.error(target.error);
  }
}

run().catch((e) => console.error(e));
