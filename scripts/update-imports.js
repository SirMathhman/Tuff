const fs = require('fs');
const path = require('path');

// Map of old location to new location
const movedFiles = {
	statements: 'interpreter/statements',
	evaluator: 'interpreter/evaluator',
	functions: 'interpreter/functions',
	assignments: 'interpreter/assignments',
	loops: 'interpreter/loops',
	modules: 'interpreter/modules',
	'function-call-utils': 'parser/function-call-utils',
	parser: 'parser/parser',
	'literal-parser': 'parser/literal-parser',
	'call-expressions': 'parser/call-expressions',
	'field-access': 'parser/field-access',
	structs: 'types/structs',
	enums: 'types/enums',
	tuples: 'types/tuples',
	arrays: 'types/arrays',
	pointers: 'types/pointers',
	compile: 'compiler/compile',
	run: 'compiler/run',
};

function getRelativePath(fromFile, toFile) {
	const from = path.dirname(fromFile);
	const to = path.dirname(toFile);
	let rel = path.relative(from, to);
	if (!rel.startsWith('.')) {
		rel = './' + rel;
	}
	return rel.replace(/\\/g, '/') + '/' + path.basename(toFile, '.ts');
}

function updateImportsInFile(filePath) {
	let content = fs.readFileSync(filePath, 'utf8');
	let updated = false;
	const srcDir = path.join(__dirname, '..', 'src');

	for (const [oldName, newLocation] of Object.entries(movedFiles)) {
		// Match imports from './oldName'
		const regex = new RegExp(`from '\\.\\/\${oldName}'`, 'g');
		const matches = content.match(regex);

		if (matches) {
			const newPath = getRelativePath(
				filePath.replace(/\\/g, '/'),
				path.join(srcDir, newLocation + '.ts').replace(/\\/g, '/'),
			);
			content = content.replace(regex, `from '${newPath}'`);
			updated = true;
		}
	}

	if (updated) {
		fs.writeFileSync(filePath, content, 'utf8');
		console.log(`Updated: ${filePath}`);
	}
}

function walkDirectory(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory() && !['node_modules', '.git', 'dist'].includes(entry.name)) {
			walkDirectory(fullPath);
		} else if (entry.isFile() && entry.name.endsWith('.ts')) {
			updateImportsInFile(fullPath);
		}
	}
}

const srcDir = path.join(__dirname, '..', 'src');
const testsDir = path.join(__dirname, '..', 'tests');
walkDirectory(srcDir);
walkDirectory(testsDir);
console.log('Import updates complete');
