import { makeDeclarationHandler, type StoreDecl } from "../declarations";
import { parseGenericParams } from "../utils/generic-params";

const storeContractDeclaration: StoreDecl = (rest, closeIndex, typeMap) => {
  const braceIndex = rest.indexOf("{");
  const { name: contractName } = parseGenericParams(
    rest.slice(0, braceIndex).trim(),
  );

  // Store contract definition
  typeMap.set("__contract__" + contractName, 1 as unknown as number);
};

export const handleContractDeclaration = makeDeclarationHandler(
  "contract",
  (rest: string) => rest.indexOf("}"),
  storeContractDeclaration,
);
