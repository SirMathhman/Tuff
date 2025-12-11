#!/usr/bin/env bun
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const script = path.join(__dirname, "self_copy.ts");
const defaultCopyName = `copy_of_${path.basename(script)}`;
const defaultCopyPath = path.join(__dirname, defaultCopyName);
const legacyJSCopyPath = path.join(__dirname, "copy_of_self_copy.js");

// Cleanup before
try {
  if (fs.existsSync(defaultCopyPath)) fs.unlinkSync(defaultCopyPath);
  if (fs.existsSync(legacyJSCopyPath)) fs.unlinkSync(legacyJSCopyPath);
} catch (e) {
  console.error("Pre-test cleanup failed", e);
  process.exit(1);
}

// Run the script with bun
execFile("bun", [script], { cwd: __dirname }, (err, stdout, stderr) => {
  if (err) {
    console.error("Failed to run script (bun):", err);
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
    process.exit(0);
  } catch (e) {
    console.error("Default-name test failed:", e);
    process.exit(1);
  }
});
