import { findChar } from "./src/parsing/parser";

const source = "let temp : () => I32 = fn get() : I32 => read I32; temp()";
const colonIndex = findChar(source, ":");
const equalsIndex = findChar(source, "=");

console.log("Full source:", source);
console.log("colonIndex:", colonIndex, "char:", source[colonIndex]);
console.log("equalsIndex:", equalsIndex, "char:", source[equalsIndex]);

// Extract type annotation
const firstSemicolonIndex = source.indexOf(";");
const bindingScope = source.substring(0, firstSemicolonIndex);
console.log("bindingScope:", bindingScope);

const colonIdx = findChar(bindingScope, ":");
const eqIdx = findChar(bindingScope, "=");
console.log("In binding scope - colonIdx:", colonIdx, "eqIdx:", eqIdx);

const typePartEnd = eqIdx === -1 ? bindingScope.length : eqIdx;
const typePart = bindingScope.substring(colonIdx + 1, typePartEnd).trim();
console.log("typePart:", typePart);
