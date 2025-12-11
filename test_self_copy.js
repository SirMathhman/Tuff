const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const script = path.join(__dirname, "self_copy.js");
// No CLI args expected; only default filename is used
const defaultCopyName = `copy_of_${path.basename(script)}`;
const defaultCopyPath = path.join(__dirname, defaultCopyName);

// Cleanup before
try {
  if (fs.existsSync(defaultCopyPath)) fs.unlinkSync(defaultCopyPath);
} catch (e) {
  console.error("Pre-test cleanup failed", e);
  process.exit(1);
}

// First test: run with no args and expect default filename
execFile("node", [script], { cwd: __dirname }, (err, stdout, stderr) => {
  if (err) {
    console.error("Failed to run script (no args):", err);
    console.error(stderr);
    process.exit(1);
  }

  try {
    const orig = fs.readFileSync(script, "utf8");
    const copy = fs.readFileSync(defaultCopyPath, "utf8");

    if (orig !== copy) {
      console.error("Default copy contents do not match! Test failed.");
      process.exit(1);
    }

    console.log("Default-name test passed: file copied and contents match.");

    // Cleanup default copy
    fs.unlinkSync(defaultCopyPath);
  } catch (e) {
    console.error("Default-name test failed:", e);
    process.exit(1);
  }

  process.exit(0);
});
// end tests
