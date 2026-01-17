const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Get list of changed TypeScript files from git.
 */
function getChangedFiles() {
	try {
		// Get staged and unstaged changes
		const output = execSync('git status --porcelain', {
			cwd: path.join(__dirname, '..'),
			encoding: 'utf8',
		});

		const files = output
			.split('\n')
			.filter((line) => line.trim().length > 0)
			.map((line) => {
				// Format: "XY filename" where X is staged status, Y is unstaged status
				// For renames, format is "R  old -> new"
				const renameMatch = line.match(/^R.+-> (.+)$/);
				if (renameMatch) {
					return renameMatch[1].trim();
				}
				const match = line.match(/^..\s+(.+)$/);
				return match ? match[1].trim() : '';
			})
			.filter((file) => file.endsWith('.ts') && (file.startsWith('src/') || file.startsWith('tests/')))
			.filter((file) => file.length > 0)
			.filter((file) => {
				// Only include files that exist (exclude deletions)
				const fullPath = path.join(__dirname, '..', file);
				return fs.existsSync(fullPath);
			});

		return files;
	} catch (e) {
		console.error('Error getting changed files from git:', e.message);
		return [];
	}
}

/**
 * Run CPD on all files in src and tests directories.
 */
function runCpdOnAll() {
	try {
		execSync(
			'pmd cpd --dir src tests --language typescript --minimum-tokens 50 --ignore-literals --ignore-identifiers --format markdown',
			{
				stdio: 'inherit',
				cwd: path.join(__dirname, '..'),
			},
		);
		return 0;
	} catch (e) {
		return e.status || 1;
	}
}

const changedFiles = getChangedFiles();

if (changedFiles.length === 0) {
	console.log('CPD: No changed TypeScript files to check');
	process.exit(0);
} else {
	console.log(`CPD: ${changedFiles.length} file(s) changed, running full CPD analysis...`);
	const exitCode = runCpdOnAll();
	process.exit(exitCode);
}
