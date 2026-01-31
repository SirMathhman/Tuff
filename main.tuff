const fs = require("fs");
const path = require("path");

// wah

// Simple compile function - takes in Tuff source and compiles it
function compile(source) {
  // For now, just return the source as-is
  return source;
}

// Read from main.tuff and write to main.js
const sourceFile = path.join(path.dirname(__filename), 'main.tuff');
const destinationFile = __filename;

// Only run the compilation if this is the main module (not being imported for testing)
if (require.main === module) {
  // Read the current file
  fs.readFile(sourceFile, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading source file:", err);
      process.exit(1);
    }

    // Compile the source and write to the destination file
    const compiled = compile(data);
    fs.writeFile(destinationFile, compiled, "utf8", (err) => {
      if (err) {
        console.error("Error writing destination file:", err);
        process.exit(1);
      }

      console.log(`Successfully compiled ${sourceFile} to ${destinationFile}`);
    });
  });
}

module.exports = { compile, sourceFile, destinationFile };
