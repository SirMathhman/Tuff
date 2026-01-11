#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const MAX_FILES_PER_DIR = 10;
const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".husky"]);

function countFilesInDir(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath);
    const files = entries.filter((entry) => {
      const fullPath = path.join(dirPath, entry);
      const stat = fs.statSync(fullPath);
      return stat.isFile();
    });
    return files.length;
  } catch (err) {
    console.error(`Error reading directory ${dirPath}:`, err.message);
    return 0;
  }
}

function checkDirectoriesRecursively(dirPath, relativePath = "") {
  const entries = fs.readdirSync(dirPath);
  let allPass = true;

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const currentRelPath = relativePath ? `${relativePath}/${entry}` : entry;

    // Skip excluded directories
    if (EXCLUDE_DIRS.has(entry)) {
      continue;
    }

    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Check file count in this directory
      const fileCount = countFilesInDir(fullPath);
      if (fileCount > MAX_FILES_PER_DIR) {
        console.error(
          `✗ Directory '${currentRelPath}' has ${fileCount} files (max: ${MAX_FILES_PER_DIR})`
        );
        allPass = false;
      } else if (fileCount > 0) {
        console.log(
          `✓ Directory '${currentRelPath}' has ${fileCount} files (OK)`
        );
      }

      // Recurse into subdirectories
      if (!checkDirectoriesRecursively(fullPath, currentRelPath)) {
        allPass = false;
      }
    }
  }

  return allPass;
}

console.log(
  `Checking directory file counts (max ${MAX_FILES_PER_DIR} files per directory)...\n`
);

const rootDir = process.cwd();
const allPass = checkDirectoriesRecursively(rootDir);

if (!allPass) {
  console.error("\n✗ Some directories exceed the file limit!");
  process.exit(1);
}

console.log("\n✓ All directories pass the file count check!");
process.exit(0);
