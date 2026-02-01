import * as fs from "fs";
import * as path from "path";

interface SplitOptions {
  source: string;
  dest: string;
  members: string[];
}

function createDirectoryIfNotExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log("[CREATE] Directory: " + dir);
  }
}

function extractMemberContent(fileContent: string, memberName: string): string | null {
  const patterns = [
    new RegExp("^function " + memberName + "\\(.*?\\)\\s*(?::.*?)?\\s*\\{[\\s\\S]*?\\n\\}", "m"),
    new RegExp("^type " + memberName + "\\s*=.*?;", "m"),
    new RegExp("^const " + memberName + "\\s*:.*?=\\s*\\{[\\s\\S]*?\\};", "m"),
  ];

  for (const pattern of patterns) {
    const match = fileContent.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

function extractMembers(sourceFilePath: string, destFilePath: string, memberNames: string[]): void {
  if (!fs.existsSync(sourceFilePath)) {
    console.error("[ERROR] Source file not found: " + sourceFilePath);
    process.exit(1);
  }

  const sourceContent = fs.readFileSync(sourceFilePath, "utf-8");
  const membersToMove: Array<{ name: string; content: string }> = [];

  for (const memberName of memberNames) {
    const content = extractMemberContent(sourceContent, memberName);
    if (!content) {
      console.warn("[WARN] Member not found: " + memberName);
      continue;
    }

    membersToMove.push({ name: memberName, content });
    console.log("[EXTRACT] " + memberName);
  }

  if (membersToMove.length === 0) {
    console.log("[SKIP] No members found to move");
    return;
  }

  createDirectoryIfNotExists(destFilePath);

  const destFileContent = membersToMove.map((m) => m.content).join("\n\n") + "\n";

  fs.writeFileSync(destFilePath, destFileContent, "utf-8");
  console.log("[WRITE] " + destFilePath + " (" + membersToMove.length + " members)");

  const relativeImportPath = path
    .relative(path.dirname(sourceFilePath), destFilePath)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");

  const importStatement = 'import { ' + memberNames.join(", ") + ' } from "./' + relativeImportPath + '";\n';

  const lines = sourceContent.split("\n");
  let insertIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("type ") || lines[i].startsWith("const ") || lines[i].startsWith("function ")) {
      insertIndex = i;
      break;
    }
  }

  lines.splice(insertIndex, 0, importStatement);
  const updatedSource = lines.join("\n");

  fs.writeFileSync(sourceFilePath, updatedSource, "utf-8");
  console.log("[UPDATE] Added import to " + sourceFilePath);
}

function main(): void {
  const args = process.argv.slice(2);

  let source = "";
  let dest = "";
  const members: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && i + 1 < args.length) {
      source = args[i + 1];
      i++;
    } else if (args[i] === "--dest" && i + 1 < args.length) {
      dest = args[i + 1];
      i++;
    } else if (args[i] === "--members" && i + 1 < args.length) {
      members.push(...args[i + 1].split(",").map((m) => m.trim()));
      i++;
    }
  }

  if (!source || !dest || members.length === 0) {
    console.error("Usage: npx ts-node split-code.ts --source <path> --dest <path> --members <name1,name2,...>");
    process.exit(1);
  }

  console.log("[START] Code split operation");
  console.log("[SOURCE] " + source);
  console.log("[DEST] " + dest);
  console.log("[MEMBERS] " + members.length + " members to extract");

  extractMembers(source, dest, members);

  console.log("[SUCCESS] Code split complete");
}

main();
