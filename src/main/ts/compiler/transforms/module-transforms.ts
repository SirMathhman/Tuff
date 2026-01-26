import { isIdentifierChar } from "../parsing/string-helpers";
import { scanModuleBody } from "./helpers/module-member-parser";
import { findModuleRegions } from "./helpers/module-validation";

/**
 * Replace variable references in member definitions with a new name
 */
function replaceVariableInMembers(
  members: string,
  oldName: string,
  newName: string,
): string {
  let result = "";
  let i = 0;
  while (i < members.length) {
    if (
      isIdentifierChar(members[i]) &&
      (i === 0 || !isIdentifierChar(members[i - 1]))
    ) {
      const start = i;
      while (i < members.length && isIdentifierChar(members[i])) i++;
      const word = members.slice(start, i);
      result += word === oldName ? newName : word;
    } else {
      result += members[i];
      i++;
    }
  }
  return result;
}

function transformModuleBody(body: string): {
  publicMembers: string;
  privateVars: Array<{ name: string; value: string }>;
} {
  const members: string[] = [];
  const privateVars: Array<{ name: string; value: string }> = [];
  scanModuleBody(body, (result) => {
    if (result.js) members.push(result.js);
    if (result.privateVar) privateVars.push(result.privateVar);
  });
  return { publicMembers: members.join(", "), privateVars };
}

/**
 * Transform module declarations to JS objects
 */
export function transformModules(source: string): string {
  const regions = findModuleRegions(source);
  let result = "";
  let cursor = 0;

  for (const region of regions) {
    result += source.slice(cursor, region.start);
    const { publicMembers, privateVars } = transformModuleBody(region.body);

    let transformedMembers = publicMembers;
    for (const pv of privateVars) {
      const prefixedName = `_${region.name}_${pv.name}`;
      result += `let ${prefixedName} = ${pv.value}; `;
      transformedMembers = replaceVariableInMembers(
        transformedMembers,
        pv.name,
        prefixedName,
      );
    }

    result += `${region.name} = { ${transformedMembers} };`;
    cursor = region.end;
  }

  return result + source.slice(cursor);
}

/**
 * Transform module access :: to dot notation
 */
export function transformModuleAccess(source: string): string {
  return source.split("::").join(".");
}
