const { execSync } = require('child_process');
const path = require('path');

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
				const match = line.match(/^..\s+(.+)$/);
				return match ? match[1] : '';
			})
			.filter((file) => file.endsWith('.ts') && (file.startsWith('src/') || file.startsWith('tests/')))
			.filter((file) => file.length > 0);

		return files;
	} catch (e) {
		console.error('Error getting changed files from git:', e.message);
		return [];
	}
}

/**
 * Run CPD on specified files.
 */
function runCpdOnFiles(files) {
	if (files.length === 0) {
		return 0;
	}

	try {
		const fileArgs = files.join(',');
		execSync(
			`pmd cpd --files ${fileArgs} --language typescript --minimum-tokens 50 --ignore-literals --ignore-identifiers --format markdown`,
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
	console.log(`CPD: Checking ${changedFiles.length} changed file(s)...`);
	const exitCode = runCpdOnFiles(changedFiles);
	process.exit(exitCode);
}
