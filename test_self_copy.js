const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const script = path.join(__dirname, "self_copy.js");
const copyName = "self_copy_test_copy.js";
const copyPath = path.join(__dirname, copyName);

// Cleanup before
try {
  if (fs.existsSync(copyPath)) fs.unlinkSync(copyPath);
} catch (e) {
  console.error("Pre-test cleanup failed", e);
  process.exit(1);
}

execFile(
  "node",
  [script, copyName],
  { cwd: __dirname },
  (err, stdout, stderr) => {
    if (err) {
      console.error("Failed to run script:", err);
      console.error(stderr);
      process.exit(1);
    }

    try {
      const orig = fs.readFileSync(script, "utf8");
      const copy = fs.readFileSync(copyPath, "utf8");

      if (orig !== copy) {
        console.error("Contents do not match! Test failed.");
        process.exit(1);
      }

      console.log("Test passed: file copied and contents match.");

      // Cleanup after test
      fs.unlinkSync(copyPath);
      process.exit(0);
    } catch (e) {
      console.error("Test failed:", e);
      process.exit(1);
    }
  }
);
