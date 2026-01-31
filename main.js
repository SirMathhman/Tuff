let fs = require("fs");
const path = require("path");

// Simple compileTuffToJS function - takes in Tuff source and compileTuffToJSs it
function compileTuffToJS(source) {
  let result = source;
  let mutVariables = [];
  
  // First pass: collect all mut variable declarations
  let validationLines = result.split("\n");
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
  
  // Second pass: check for unauthorized reassignments
  let checkLines = result.split("\n");
  for (let i = 0; i < checkLines.length; i = i + 1) {
    let line = checkLines[i];
    let trimmed = line.trim();
    // Look for reassignments: name = value (but not let name = ... or function stuff or const)
    if (trimmed.includes(" = ") && !trimmed.includes("let ") && !trimmed.includes("function ") && !trimmed.includes("const ")) {
      let assignIdx = trimmed.indexOf(" = ");
      let varName = trimmed.substring(0, assignIdx).trim();
      // Check if this is a simple variable name (not an object property or array access)
      if (!varName.includes(".") && !varName.includes("[")) {
        // Check if this variable is in mutVariables
        let found = 0;
        for (let j = 0; j < mutVariables.length; j = j + 1) {
          if (mutVariables[j] === varName) {
            found = 1;
          }
        }
        if (found === 0) {
          // This is an error: reassigning immutable variable
          let errMsg = "Error: cannot reassign immutable variable '" + varName + "'";
          throw errMsg;
        }
      }
    }
  }
  
  // Continue with regular transformations...
  
  // Transform: const identifier = require("module"); -> const identifier = require("module");
  let transformLines = result.split("\n");
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
  result = transformed.join("\n");
  
  // Transform: function to function
  // Handle "function " at start of line
  let fnLines = result.split("\n");
  transformed = [];
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
  result = transformed.join("\n");
  
  // Transform: remove ) => { to ) {
  result = result.replace(") => {", ") {");
  
  // Transform: Rust-like for loops to JavaScript
  // for (let i = 0; i < 10; i = i + 1) -> for (let i = 0; i < 10; i = i + 1)
  let forLines = result.split("\n");
  transformed = [];
  for (let idx = 0; idx < forLines.length; idx = idx + 1) {
    let line = forLines[idx];
    let forStr = "for" + " ";
    if (line.includes(forStr + "(let ")) {
      // Check if this is a Rust-like for loop with " in "
      if (line.includes(" in ") && line.includes("..")) {
        // Find the start: "for (let "
        let forStart = line.indexOf(forStr + "(let ");
        let letEnd = line.indexOf(" in ", forStart);
        let varName = line.substring(forStart + 9, letEnd);
        
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
  result = transformed.join("\n");
  
  // Transform: remove mut keyword from let declarations
  // let x -> let x
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

// Read from main.tuff and write to main.js
let sourceFile = path.join(path.dirname(__filename), 'main.tuff');
let destinationFile = __filename;

// Only run the compilation if this is the main module (not being imported for testing)
if (require.main === module) {
  // Read the current file
  fs.readFile(sourceFile, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading source file:", err);
      process.exit(1);
    }

    // compileTuffToJS the source and write to the destination file
    const compileTuffToJSd = compileTuffToJS(data);
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
