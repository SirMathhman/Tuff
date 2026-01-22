import { encodeTo64Bits, decode } from "./vm";

const inst = {
  opcode: 0,
  variant: 0,
  operand1: 0,
  operand2: 255,
};

console.log("Original:", inst);

const encoded = encodeTo64Bits(inst);
console.log("Encoded (dec):", encoded);
console.log("Encoded (hex):", encoded.toString(16).padStart(8, "0"));
console.log("Encoded (binary):", encoded.toString(2).padStart(40, "0"));

// Manual check
console.log("\nBit extraction:");
console.log("opcode ((encoded >> 32) & 0xff):", (encoded >> 32) & 0xff);
console.log("variant ((encoded >> 24) & 0xff):", (encoded >> 24) & 0xff);
console.log("operand1 ((encoded >> 12) & 0xfff):", (encoded >> 12) & 0xfff);
console.log("operand2 (encoded & 0xfff):", encoded & 0xfff);

const decoded = decode(encoded);
console.log("\nDecoded:", decoded);
