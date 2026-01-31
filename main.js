const fs = require("fs");
const path = require("path");

// Get the path of the main.tuff source file (Tuff language source)
const sourceFile = path.join(path.dirname(__filename), "main.tuff");

// Define the destination file path (update main.js itself with compiled output)
const destinationFile = __filename;

// Read the current file
fs.readFile(sourceFile, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading source file:", err);
    process.exit(1);
  }

  // Write to the destination file
  fs.writeFile(destinationFile, data, "utf8", (err) => {
    if (err) {
      console.error("Error writing destination file:", err);
      process.exit(1);
    }

    console.log(`Successfully compiled ${sourceFile} to ${destinationFile}`);
  });
});

module.exports = { sourceFile, destinationFile };
