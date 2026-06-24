import * as fs from "fs";
import { compileTuffToJS } from "./lib.js";

const source = fs.readFileSync("./main.tuff", "utf-8");
const target = compileTuffToJS(source);
if (target.variant === "err") {
  console.error(target.error);
  process.exit(1);
}

const wrapInExit = "process.exit(" + target.value + ");";
fs.writeFileSync("./main.js", wrapInExit, "utf-8");
