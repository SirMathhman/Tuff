import { compile, evaluate } from "./index.ts";

// Mixed branches: x inferred as U8 | U16, checked as U8 | U16 → fold to 1
const c1 = "in let args : &[&Str]; let x = if (args.length == 2) 1U8 else 1U16; x is U8 | U16";
console.log("union subset compile:", compile(c1));
console.log("union subset eval:", evaluate(c1, ["mock_program_name", "foo"]));

// Same-type branches still fold
const c2 = "in let args : &[&Str]; let x = if (args.length == 2) 100U8 else 200U8; x is U8";
console.log("same-type compile:", compile(c2));
console.log("same-type eval:", evaluate(c2, ["mock_program_name", "foo"]));
