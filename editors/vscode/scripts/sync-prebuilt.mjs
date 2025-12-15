import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension root: <repo>/editors/vscode
const extRoot = path.resolve(__dirname, "..");

// Source prebuilt: <repo>/selfhost/prebuilt
const srcPrebuilt = path.resolve(extRoot, "..", "..", "selfhost", "prebuilt");

// Destination inside extension: <repo>/editors/vscode/prebuilt
const dstPrebuilt = path.resolve(extRoot, "prebuilt");

if (!fs.existsSync(srcPrebuilt)) {
  console.error(`[tuff-lang] prebuilt compiler not found at: ${srcPrebuilt}`);
  process.exit(1);
}

fs.rmSync(dstPrebuilt, { recursive: true, force: true });
fs.mkdirSync(dstPrebuilt, { recursive: true });

// Node 16+ supports fs.cpSync. Copies directory recursively.
fs.cpSync(srcPrebuilt, dstPrebuilt, { recursive: true });

console.log(`[tuff-lang] copied prebuilt compiler -> ${dstPrebuilt}`);
