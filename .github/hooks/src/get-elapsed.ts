import { readFileSync, writeFileSync } from "fs";

const startPath = "./.github/hooks/cache/start.txt";
const lastNotifiedPath = "./.github/hooks/cache/last-notified-interval.txt";

const INTERVAL_MS = 5_000;

try {
  const start = Number(readFileSync(startPath, "utf-8"));
  const lastNotified = Number(readFileSync(lastNotifiedPath, "utf-8"));

  const elapsedMs = Date.now() - start;
  const currentInterval = Math.floor(elapsedMs / INTERVAL_MS);

  if (currentInterval > lastNotified && currentInterval >= 1) {
    writeFileSync(lastNotifiedPath, currentInterval.toString(), "utf-8");
    const elapsedSeconds = currentInterval * (INTERVAL_MS / 1000);

    console.log(JSON.stringify({
      decision: "block",
      reason: `You have been working on this task for ${elapsedSeconds} seconds.`,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `You have been working on this task for ${elapsedSeconds} seconds.`,
      },
    }));
    process.exit(0);
  }

  process.exit(0);
} catch {
  process.exit(0);
}