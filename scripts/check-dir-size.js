const fs = require('fs');
const path = require('path');

const MAX_FILES = 17;
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'coverage', '.husky', '.vscode', '.idea'];

function countFiles(dir) {
	let fileCount = 0;
	let failed = false;

	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch (e) {
		console.error(`Error reading directory ${dir}: ${e.message}`);
		return false;
	}

	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (!IGNORE_DIRS.includes(entry.name)) {
				if (!countFiles(path.join(dir, entry.name))) {
					failed = true;
				}
			}
		} else {
			fileCount++;
		}
	}

	if (fileCount > MAX_FILES) {
		console.error(`Error: Directory '${dir}' contains ${fileCount} files (limit is ${MAX_FILES}).`);
		return false;
	}

	return !failed;
}

const rootDir = process.cwd();
console.log(`Checking directory sizes startting from ${rootDir}...`);
if (!countFiles(rootDir)) {
	process.exit(1);
}
console.log('File count check passed.');
