const { execSync } = require("child_process");

try {
  execSync("bun ./src/main.js", { stdio: "inherit" });
} catch (error) {
  if (typeof error.status === "number") {
    console.log("Exit code: " + error.status);
    process.exit(0);
  }
  throw error;
}
console.log("Exit code: 0");
process.exit(0);
