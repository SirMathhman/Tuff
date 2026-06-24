import * as fs from "fs";

function Ok(value) {
  return { variant: "ok", value };
}

function Err(error) {
  return { variant: "err", error };
}

export function compileTuffToJS(source) {
  return Err("Invalid source: " + source);
}

const source = fs.readFileSync("./main.tuff", "utf-8");
const target = compileTuffToJS(source);
if (target.variant === "err") {
  console.error(target.error);
  process.exit(1);
}

const wrapInExit = "process.exit(" + target.value + ");";
fs.writeFileSync("./main.js", wrapInExit, "utf-8");
