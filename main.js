const fs = require("fs");
const path = require("path");

// Simple compile function - takes in Tuff source and compiles it
function compile(source) {
  // For now, just return the source as-is
  return source;
}

// Get the path of the current file
const sourceFile = __filename;

// Define the destination file path (same directory with -copy suffix)
const destinationFile = path.join(
  path.dirname(sourceFile),
  path.basename(sourceFile, path.extname(sourceFile)) + path.extname(sourceFile),
);

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

module.exports = { sourceFile, destinationFile };
