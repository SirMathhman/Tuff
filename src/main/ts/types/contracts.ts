import { makeDeclarationHandler, type StoreDecl } from "../declarations";
import { parseGenericParams } from "../utils/generic-params";
import { findMatchingCloseBrace } from "../utils/helpers/brace-utils";

const storeContractDeclaration: StoreDecl = (rest, closeIndex, typeMap) => {
  const braceIndex = rest.indexOf("{");
  const { name: contractName } = parseGenericParams(
    rest.slice(0, braceIndex).trim(),
  );

  // Check for duplicate contract declaration
  if (typeMap.has("__contract__" + contractName)) {
    throw new Error(`Duplicate contract declaration: ${contractName}`);
  }

  // Store contract definition
  typeMap.set("__contract__" + contractName, 1 as unknown as number);
};

export const handleContractDeclaration = makeDeclarationHandler(
  "contract",
  (rest: string) => {
    const braceIndex = rest.indexOf("{");
    if (braceIndex === -1) return -1;
    return findMatchingCloseBrace(rest, braceIndex);
  },
  storeContractDeclaration,
);
