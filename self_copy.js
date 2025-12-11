#!/usr/bin/env node
// self_copy.js - copies its own source to a new file

const fs = require("fs").promises;
const path = require("path");

async function main() {
  try {
    // Source file: the script itself
    const sourcePath = __filename;

    // Allow user to provide target path, otherwise create a timestamped copy
    const userProvided = process.argv[2];
    const baseName = path.basename(sourcePath);
    const dirName = process.cwd();

    const targetName = userProvided || `copy_of_${baseName}_${Date.now()}.js`;
    const targetPath = path.isAbsolute(targetName)
      ? targetName
      : path.join(dirName, targetName);

    // Read this file and write it to target
    const content = await fs.readFile(sourcePath, "utf8");
    await fs.writeFile(targetPath, content, { encoding: "utf8", flag: "w" });

    console.log(`Copied ${sourcePath} -> ${targetPath}`);
  } catch (err) {
    console.error("Error copying file:", err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = main;
