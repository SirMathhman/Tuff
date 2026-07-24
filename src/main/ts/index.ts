import { compileTuffToTS } from "./compile";
import * as fs from "fs/promises";

async function run() {
  const source = await fs.readFile("./src/main/tuff/lib.tuff", "utf-8");
  const generated = compileTuffToTS(source);
  if (!generated.isOk) {
    console.error(generated.error);
    process.exit(1);
  }

  await fs.writeFile(
    "./src/main/generated-ts/lib.ts",
    generated.value,
    "utf-8",
  );
}

run().catch((e) => {
  console.error(e);
});
