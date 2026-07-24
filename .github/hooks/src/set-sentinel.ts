import { writeFileSync } from "fs";

const startPath = "./.github/hooks/cache/start.txt";
const lastNotifiedPath = "./.github/hooks/cache/last-notified-interval.txt";

writeFileSync(startPath, Date.now().toString(), "utf-8");
writeFileSync(lastNotifiedPath, "0", "utf-8");
