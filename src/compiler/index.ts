/**
 * Tuff to JavaScript compiler
 * Main entry point for compilation
 */

export { compileProgram } from "./codegen";
export { runtime } from "./runtime";

import { parseProgram } from "../ast";
import { compileProgram } from "./codegen";

/**
 * Compile Tuff source code to JavaScript
 * @param source - Tuff source code
 * @returns Generated JavaScript code
 */
export function compile(source: string): string {
  const program = parseProgram(source);
  return compileProgram(program);
}
