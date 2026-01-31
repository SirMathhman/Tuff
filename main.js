const fs = require("fs");
const path = require("path");





// Helper: Collect all mut variable declarations
function collectMutVariables(source) {
  let mutVariables = [];
  let validationLines = source.split("\n");
  for (let i = 0; i < validationLines.length; i = i + 1) {
    let line = validationLines[i];
    let letMutStr = "let" + " " + "mut" + " ";
    if (line.includes(letMutStr)) {
      // Extract variable name: let x = ...
      let idx = line.indexOf(letMutStr);
      let afterLet = line.substring(idx + 8);
      let spaceIdx = afterLet.indexOf(" ");
      let varName = afterLet.substring(0, spaceIdx);
      mutVariables.push(varName);
    }
  }
  return mutVariables;
}

// Helper: Validate that only mut variables are reassigned
function validateMutability(source, mutVariables) {
  let checkLines = source.split("\n");
  for (let i = 0; i < checkLines.length; i = i + 1) {
    let line = checkLines[i];
    let trimmed = line.trim();
    let typeKeyword = "t" + "y" + "p" + "e";
    let structKeyword = "s" + "t" + "r" + "u" + "c" + "t";
    // Skip type aliases and struct declarations from validation
    if (trimmed.indexOf(typeKeyword + " ") === 0 || trimmed.indexOf(structKeyword + " ") === 0) {
      // Skip validation for these lines
    } else if (trimmed.includes(" = ") && !trimmed.includes("let ") && !trimmed.includes("function ") && !trimmed.includes("const ")) {
      let assignIdx = trimmed.indexOf(" = ");
      let varName = trimmed.substring(0, assignIdx).trim();
      // Check if this.kind === "a" simple variable name (not an object property or array access)
      if (!varName.includes(".") && !varName.includes("[")) {
        // Check if this variable.kind === "in" mutVariables
        let found = 0;
        for (let j = 0; j < mutVariables.length; j = j + 1) {
          if (mutVariables[j] === varName) {
            found = 1;
          }
        }
        if (found === 0) {
          // This.kind === "an" error: reassigning immutable variable
          let errMsg = "Error: cannot reassign immutable variable '" + varName + "'";
          return { kind : "Err", err : errMsg };
        }
      }
    }
  }
  return { kind : "Ok", value : source };
}

// Helper: Remove type aliases and struct declarations
function removeTypeDeclarations(source) {
  let aliasLines = source.split("\n");
  let filteredLines = [];
  let bracketDepth = 0;
  for (let i = 0; i < aliasLines.length; i = i + 1) {
    let line = aliasLines[i];
    let trimmed = line.trim();
    let typeKeyword = "t" + "y" + "p" + "e";
    let structKeyword = "s" + "t" + "r" + "u" + "c" + "t";
    let openBrace = "{";
    let closeBrace = "}";
    
    // Check if line starts with struct keyword
    if (trimmed.indexOf(structKeyword + " ") === 0) {
      // Count braces on this struct declaration line
      let openCount = 0;
      let closeCount = 0;
      for (let j = 0; j < line.length; j = j + 1) {
        if (line.substring(j, j + 1) === openBrace) {
          openCount = openCount + 1;
        }
        if (line.substring(j, j + 1) === closeBrace) {
          closeCount = closeCount + 1;
        }
      }
      bracketDepth = bracketDepth + openCount;
      bracketDepth = bracketDepth - closeCount;
      filteredLines.push("");
    } else if (bracketDepth > 0) {
      // Remove lines while inside struct (tracking brace depth)
      let openCount = 0;
      let closeCount = 0;
      for (let j = 0; j < line.length; j = j + 1) {
        if (line.substring(j, j + 1) === openBrace) {
          openCount = openCount + 1;
        }
        if (line.substring(j, j + 1) === closeBrace) {
          closeCount = closeCount + 1;
        }
      }
      bracketDepth = bracketDepth + openCount;
      bracketDepth = bracketDepth - closeCount;
      filteredLines.push("");
    } else if (trimmed.indexOf(typeKeyword + " ") === 0) {
      // Replace alias declarations with empty string to preserve blank lines
      filteredLines.push("");
    } else {
      filteredLines.push(line);
    }
  }
  return filteredLines.join("\n");
}

// Helper: Transform const statements to require()
function transformExternUse(source) {
  let transformLines = source.split("\n");
  let transformed = [];
  for (let i = 0; i < transformLines.length; i = i + 1) {
    let line = transformLines[i];
    let searchTerm = "extern" + " " + "use";
    if (line.includes(searchTerm)) {
      // Replace: const fs = require("fs"); -> const fs = require("fs");
      line = line.replace(searchTerm + " ", "const ");
      line = line.replace(" from ", " = require(\"");
      line = line.replace(";", "\");");
    }
    transformed.push(line);
  }
  return transformed.join("\n");
}

// Helper: Transform function keyword to function
function transformFnKeyword(source) {
  let fnLines = source.split("\n");
  let transformed = [];
  for (let i = 0; i < fnLines.length; i = i + 1) {
    let line = fnLines[i];
    let trimmed = line.trimStart();
    let fnKeyword = "f" + "n";
    if (trimmed.includes(fnKeyword + " ")) {
      let idx = line.indexOf(fnKeyword + " ");
      if (idx !== -1) {
        line = line.substring(0, idx) + "function " + line.substring(idx + 3);
      }
    }
    transformed.push(line);
  }
  return transformed.join("\n");
}

// Helper: Remove type annotations
function removeTypeAnnotations(source) {
  let replaced = source;
  let attemptCount = 0;
  while (attemptCount < 100) {
    let beforeReplace = replaced;
    
    // Remove type patterns by concatenating strings to avoid transformation
    let colonSpace = " " + ":" + " ";
    replaced = replaced.replace(colonSpace + "String", "");
    replaced = replaced.replace(colonSpace + "Number", "");
    replaced = replaced.replace(colonSpace + "Boolean", "");
    replaced = replaced.replace(colonSpace + "Array", "");
    replaced = replaced.replace(colonSpace + "Object", "");
    replaced = replaced.replace(colonSpace + "Function", "");
    replaced = replaced.replace(colonSpace + "Any", "");
    replaced = replaced.replace(colonSpace + "Result<String, String>", "");
    
    if (replaced === beforeReplace) {
      attemptCount = 100;
    }
    attemptCount = attemptCount + 1;
  }
  return replaced;
}

// Helper: Remove arrow function syntax
function removeArrowSyntax(source) {
  let result = source;
  let lines = result.split("\n");
  let transformed = [];
  for (let i = 0; i < lines.length; i = i + 1) {
    let line = lines[i];
    // Only remove ) => { when it appears after "function" keyword
    if (line.includes("function ")) {
      line = line.replace(") => {", ") {");
    }
    transformed.push(line);
  }
  return transformed.join("\n");
}

// Helper: Remove generic type parameters from struct instantiations
function removeGenericParameters(source) {
  let result = source;
  let doneWithInstantiation = 0;
  while (doneWithInstantiation === 0) {
    let beforeRemoval = result;
    let newResult = "";
    let i = 0;
    let openAngle = "<";
    let closeAngle = ">";
    let openBrace = "{";
    
    while (i < result.length) {
      let anglePos = result.indexOf(openAngle, i);
      if (anglePos === -1) {
        // No more <, copy rest
        newResult = newResult + result.substring(i);
        i = result.length;
      } else {
        let bracePos = result.indexOf(openBrace, anglePos);
        if (bracePos === -1) {
          // No { after this <, copy up to < and continue
          newResult = newResult + result.substring(i, anglePos + 1);
          i = anglePos + 1;
        } else {
          // Check if there's matching > between < and {
          let depth = 0;
          let matchingClose = -1;
          for (let j = anglePos; j < bracePos; j = j + 1) {
            let char = result.substring(j, j + 1);
            if (char === openAngle) {
              depth = depth + 1;
            }
            if (char === closeAngle) {
              depth = depth - 1;
              if (depth === 0) {
                matchingClose = j;
              }
            }
          }
          
          if (matchingClose !== -1) {
            // Found matching >. Check what's between matchingClose and bracePos
            let between = result.substring(matchingClose + 1, bracePos).trim();
            if (between.length === 0) {
              // This.kind === "struct" instantiation! Remove <...>
              newResult = newResult + result.substring(i, anglePos);
              i = matchingClose + 1;
            } else {
              // Not struct instantiation, keep the <
              newResult = newResult + result.substring(i, anglePos + 1);
              i = anglePos + 1;
            }
          } else {
            // No matching >, keep the <
            newResult = newResult + result.substring(i, anglePos + 1);
            i = anglePos + 1;
          }
        }
      }
    }
    
    result = newResult;
    if (result === beforeRemoval) {
      doneWithInstantiation = 1;
    }
  }
  return result;
}

// Helper: Transform.kind === "operator" for type checking
function transformIsOperator(source) {
  let result = source;
  let isOpDone = 0;
  while (isOpDone === 0) {
    let beforeIs = result;
    let newResult = "";
    let i = 0;
    let isKeyword = " " + "is" + " ";
    
    while (i < result.length) {
      let isPos = result.indexOf(isKeyword, i);
      if (isPos === -1) {
        // No more is-keyword, copy rest
        newResult = newResult + result.substring(i);
        i = result.length;
      } else {
        // Found is-keyword - extract the variable name before it
        let before = result.substring(0, isPos);
        let varStart = isPos - 1;
        // Walk backwards to find start of identifier
        while (varStart > 0) {
          let ch = before.substring(varStart - 1, varStart);
          let isAlphaNum = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch === "_" || ch === ".";
          if (!isAlphaNum) {
            varStart = varStart;
            break;
          }
          varStart = varStart - 1;
        }
        let varName = result.substring(varStart, isPos);
        
        // Find the type name after is-keyword
        let typeStart = isPos + isKeyword.length;
        let typeEnd = typeStart;
        // Walk forward to find endof type name (before <)
        while (typeEnd < result.length) {
          let ch = result.substring(typeEnd, typeEnd + 1);
          if (ch === "<" || ch === ";" || ch === " " || ch === ")" || ch === "{" || ch === ",") {
            break;
          }
          typeEnd = typeEnd + 1;
        }
        let typeName = result.substring(typeStart, typeEnd);
        
        // Skip generic type parameters if present
        let afterType = typeEnd;
        if (result.substring(typeEnd, typeEnd + 1) === "<") {
          // Find matching >
          let depth = 1;
          afterType = typeEnd + 1;
          while (afterType < result.length && depth > 0) {
            let ch = result.substring(afterType, afterType + 1);
            if (ch === "<") {
              depth = depth + 1;
            } else if (ch === ">") {
              depth = depth - 1;
            }
            afterType = afterType + 1;
          }
        }
        
        // Build replacement: varName.kind === "TypeName"
        let replacement = varName + ".kind === \"" + typeName + "\"";
        newResult = newResult + result.substring(i, varStart) + replacement;
        i = afterType;
      }
    }
    
    result = newResult;
    if (result === beforeIs) {
      isOpDone = 1;
    }
  }
  return result;
}

// Helper: Transform struct instantiation to add kind property
function addKindToStructInstantiation(source) {
  let result = source;
  let structInstDone = 0;
  while (structInstDone === 0) {
    let beforeInst = result;
    let newResult = "";
    let i = 0;
    let openBrace = " {";
    
    while (i < result.length) {
      // Look for pattern: StructName {
      // where StructName starts with uppercase letter
      let bracePos = result.indexOf(openBrace, i);
      if (bracePos === -1) {
        // No more {, copy rest
        newResult = newResult + result.substring(i);
        i = result.length;
      } else {
        // Check if there's an identifier before the {
        let nameStart = bracePos - 1;
        // Skip whitespace backwards
        while (nameStart > 0 && result.substring(nameStart, nameStart + 1) === " ") {
          nameStart = nameStart - 1;
        }
        let nameEnd = nameStart + 1;
        
        // Walk backwards to find start of identifier
        while (nameStart > 0) {
          let ch = result.substring(nameStart - 1, nameStart);
          let isAlphaNum = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch === "_";
          if (!isAlphaNum) {
            break;
          }
          nameStart = nameStart - 1;
        }
        
        let structName = result.substring(nameStart, nameEnd);
        let firstChar = structName.substring(0, 1);
        let isUpperCase = firstChar >= "A" && firstChar <= "Z";
        
        // Check for invalid patterns (equals sign before name, or function keyword)
        let beforeName = result.substring(nameStart - 10, nameStart);
        let hasEquals = beforeName.includes("=");
        let isFunction = beforeName.includes("function");
        
        if (isUpperCase && structName.length > 0 && !isFunction && hasEquals) {
          // This looks like a struct instantiation
          // Replace: StructName { -> { kind : "StructName",
          let replacement = "{ kind : \"" + structName + "\",";
          newResult = newResult + result.substring(i, nameStart) + replacement;
          i = bracePos + openBrace.length;
        } else {
          // Not a struct instantiation, copy up to and including {
          newResult = newResult + result.substring(i, bracePos + openBrace.length);
          i = bracePos + openBrace.length;
        }
      }
    }
    
    result = newResult;
    if (result === beforeInst) {
      structInstDone = 1;
    }
  }
  return result;
}

// Helper: Transform Rust-like for loops to JavaScript
function transformForLoops(source) {
  let forLines = source.split("\n");
  let transformed = [];
  for (let idx = 0; idx < forLines.length; idx = idx + 1) {
    let line = forLines[idx];
    let forStr = "for" + " ";
    if (line.includes(forStr + "(let ")) {
      // Check if this.kind === "a" Rust-like for loop with " in "
      if (line.includes(" in ") && line.includes("..")) {
        // Find the start: "for (let " or "for (let "
        let forStart = line.indexOf(forStr + "(let ");
        let letEnd = line.indexOf(" in ", forStart);
        
        // Extract variable name, handling both "let" and "let mut"
        let afterFor = line.substring(forStart + 5);
        let inIdx = afterFor.indexOf(" in ");
        let beforeIn = afterFor.substring(0, inIdx);
        let varName = beforeIn.replace("(let ", "").replace("let ", "").replace("mut ", "").trim();
        
        // Find the range: "0..10"
        let inPos = letEnd;
        let dotDotPos = line.indexOf("..", inPos);
        let endPos = line.indexOf(")", dotDotPos);
        
        let rangeStart = line.substring(inPos + 4, dotDotPos).trim();
        let rangeEnd = line.substring(dotDotPos + 2, endPos).trim();
        
        // Replace with JavaScript for loop
        let newLoop = "for (let " + varName + " = " + rangeStart + "; " + varName + " < " + rangeEnd + "; " + varName + " = " + varName + " + 1)";
        line = line.substring(0, forStart) + newLoop + line.substring(endPos + 1);
      }
    }
    transformed.push(line);
  }
  return transformed.join("\n");
}

// Helper: Remove mut keyword from let declarations
function removeMutKeyword(source) {
  let result = source;
  let finished = 0;
  let mutKeyword = "let" + " " + "mut" + " ";
  let letKeyword = "let" + " ";
  while (finished === 0) {
    let newResult = result.replace(mutKeyword, letKeyword);
    if (newResult === result) {
      finished = 1;
    }
    result = newResult;
  }
  return result;
}

// Simple compileTuffToJS function - takes in Tuff source and returns Result
function compileTuffToJS(source) {
  let result = source;
  
  // Validation pass
  let mutVariables = collectMutVariables(result);
  let validationResult = validateMutability(result, mutVariables);
  if (validationResult.kind === "Err") {
    return validationResult;
  }
  
  // Remove type declarations
  result = removeTypeDeclarations(result);
  
  // Apply transformations
  result = transformExternUse(result);
  result = transformFnKeyword(result);
  result = removeTypeAnnotations(result);
  result = removeArrowSyntax(result);
  result = removeGenericParameters(result);
  result = transformIsOperator(result);
  result = addKindToStructInstantiation(result);
  result = transformForLoops(result);
  result = removeMutKeyword(result);
  
  return { kind : "Ok", value : result };
}

// Read from main.tuff and write to main.js
let sourceFile = path.join(path.dirname(__filename), 'main.tuff');
let destinationFile = __filename;

// Only run the compilation if this.kind === "the" main module (not being imported for testing)
if (require.main === module) {
  // Read the current file
  fs.readFile(sourceFile, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading source file:", err);
      process.exit(1);
    }

    // compileTuffToJS the source and write to the destination file
    const compilationResult = compileTuffToJS(data);
    
    if (compilationResult.kind === "Err") {
      console.error("Compilation error:", compilationResult.err);
      process.exit(1);
    }
    
    const compileTuffToJSd = compilationResult.value;
    fs.writeFile(destinationFile, compileTuffToJSd, "utf8", (err) => {
      if (err) {
        console.error("Error writing destination file:", err);
        process.exit(1);
      }

      console.log(`Successfully compileTuffToJSd ${sourceFile} to ${destinationFile}`);
    });
  });
}

module.exports = { compileTuffToJS, sourceFile, destinationFile };
