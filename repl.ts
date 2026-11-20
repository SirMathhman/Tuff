import { createInterface } from "node:readline";
import { interpretTuff } from "./index";

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "tuff> " });

let exiting = false;

rl.prompt();
rl.on("line", (line) => {
  if (exiting) return;
  const source = line.trim();
  if (source === "exit") {
    exiting = true;
    rl.close();
    return;
  }
  if (source !== "") {
    const result = interpretTuff(source);
    console.log(
      result.ok
        ? result.value
        : `error: ${result.error.what} (at offset ${result.error.where})`,
    );
  }
  rl.prompt();
});
rl.on("close", () => {
  console.log();
});
