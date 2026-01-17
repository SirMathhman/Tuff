const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const CACHE_FILE = path.join(__dirname, '..', '.cpd-cache.json');
const DIRS_TO_CHECK = ['src', 'tests'];

/**
 * Get modification times and compute hash for all TypeScript files.
 */
function computeFilesHash() {
	const files = [];
	const hashes = [];

	for (const dir of DIRS_TO_CHECK) {
		const dirPath = path.join(__dirname, '..', dir);
		if (!fs.existsSync(dirPath)) {
			continue;
		}
		collectFiles(dirPath, files);
	}

	files.sort();

	for (const file of files) {
		const stat = fs.statSync(file);
		const content = fs.readFileSync(file, 'utf8');
		const hash = crypto.createHash('md5').update(content).digest('hex');
		hashes.push(`${file}:${stat.mtimeMs}:${hash}`);
	}

	return crypto.createHash('md5').update(hashes.join('|')).digest('hex');
}

/**
 * Recursively collect all .ts files.
 */
function collectFiles(dir, files) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectFiles(fullPath, files);
		} else if (entry.isFile() && entry.name.endsWith('.ts')) {
			files.push(fullPath);
		}
	}
}

/**
 * Load cache from disk.
 */
function loadCache() {
	try {
		if (fs.existsSync(CACHE_FILE)) {
			const content = fs.readFileSync(CACHE_FILE, 'utf8');
			return JSON.parse(content);
		}
	} catch (e) {
		// Ignore errors, treat as cache miss
	}
	return { hash: '', timestamp: 0 };
}

/**
 * Save cache to disk.
 */
function saveCache(hash) {
	const cache = {
		hash,
		timestamp: Date.now(),
	};
	fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, undefined, 2));
}

/**
 * Run CPD and return exit code.
 */
function runCpd() {
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

const currentHash = computeFilesHash();
const cache = loadCache();

if (cache.hash === currentHash) {
	console.log('CPD: No changes detected, using cached result (passed)');
	process.exit(0);
} else {
	console.log('CPD: Changes detected, running analysis...');
	const exitCode = runCpd();
	if (exitCode === 0) {
		saveCache(currentHash);
	}
	process.exit(exitCode);
}
