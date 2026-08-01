import { test, expect } from "bun:test";
import { compile } from ".";

function execute(source, args) {
  const generated = compile("in let args : &[&Str]; " + source);
  return new Function("args", generated + " main()");
}

