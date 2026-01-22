import { extractFunctionType, isFunctionDefinition } from "./src/parsing/function-parsing";

const funcDef = "fn get() : I32 => read I32";
console.log("Is function definition:", isFunctionDefinition(funcDef));
console.log("Extracted type:", extractFunctionType(funcDef));
