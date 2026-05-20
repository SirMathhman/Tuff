import OpenAI from "openai";
import * as fs from "fs";
import { writeFile } from "fs/promises";
import { createInterface } from "readline/promises";
import * as path from "path";
import * as child_process from "child_process";
import ts from "typescript";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";

// ── Client ────────────────────────────────────────────────────────────────────

const client = new OpenAI({
  baseURL: "http://127.0.0.1:8080/v1",
  apiKey: "dummy",
});

const MODEL = "Qwen3.6-27B-Q4_K_M-mtp.gguf";

// ── Tool definitions (OpenAI schema) ─────────────────────────────────────────

function simpleTool(
  name: string,
  description: string,
): OpenAI.Chat.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
  };
}

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "createFile",
      description:
        "Create a file with the given name. Creates parent directories automatically.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Path to the file to create" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editFile",
      description:
        "Edit an existing file. StartLine is inclusive, endLine is exclusive. Line numbers start at 1. Max 25 lines.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          startLine: { type: "number" },
          endLine: { type: "number" },
          content: { type: "string", description: "Replacement content" },
        },
        required: ["name", "startLine", "endLine", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readFile",
      description: `Read a file and return its content with line numbers.
      startLine is inclusive, endLine is exclusive. Line numbers start at 1.
      Max 500 lines.`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          startLine: { type: "number" },
          endLine: { type: "number" },
        },
        required: ["name", "startLine", "endLine"],
      },
    },
  },
  simpleTool(
    "deleteFile",
    "Delete a file. Recursively removes empty parent directories.",
  ),
  {
    type: "function",
    function: {
      name: "deleteLines",
      description:
        "Delete a range of lines from a file. startLine is inclusive, endLine is exclusive. Line numbers start at 1.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Path to the file" },
          startLine: {
            type: "number",
            description: "First line to delete (inclusive, 1-based)",
          },
          endLine: {
            type: "number",
            description: "Last line to delete (exclusive, 1-based)",
          },
        },
        required: ["name", "startLine", "endLine"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listDirectory",
      description:
        "List the contents of a directory. " +
        "Respects .gitignore — ignored paths are excluded from the listing, but .gitignore itself is always reported as present. " +
        "Always excludes node_modules and .git regardless of .gitignore. " +
        "Use this instead of powershell to explore project structure. " +
        "Set recursive=true to walk the full tree.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to list",
          },
          recursive: {
            type: "boolean",
            description:
              "Whether to recurse into subdirectories (default: false)",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "powershell",
      description:
        "Execute a PowerShell command and return stdout/stderr. " +
        "Use for running tests, builds, and shell commands. " +
        "Do NOT use this to list files or explore directory structure — use listDirectory instead.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
        required: ["command"],
      },
    },
  },
];

// ── Tool implementations ──────────────────────────────────────────────────────

async function createFile(name: string): Promise<string> {
  if (fs.existsSync(name)) return "Error: File already exists.";
  const dir = path.dirname(name);
  if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
  await writeFile(name, "", "utf-8");

  const lintingResult = await lintFile(name);
  if (lintingResult) {
    return "File has errors: " + lintingResult;
  }

  return "File created with no linting errors.";
}

async function lintFile(fileName: string): Promise<string | undefined> {
  // We want to run two commands:
  // npm run lint:eslint:file -- <fileName>

  console.log("Linting: " + fileName);
  const eslintResult = await powershell(
    "npm run lint:eslint:file -- " + fileName,
  );

  if (eslintResult.exitCode === 0) return undefined;
  else return eslintResult.stdout + eslintResult.stderr;
}

async function editFile(
  name: string,
  startLine: number,
  endLine: number,
  content: string,
): Promise<string> {
  if (!fs.existsSync(name)) return "Error: File not found.";
  const lineCount = endLine - startLine;
  if (lineCount > 25) {
    return "Error: Too many lines. Max 25 lines: " + lineCount;
  }

  const lines = (await fs.promises.readFile(name, "utf-8")).split("\n");
  const updated = [
    ...lines.slice(0, startLine - 1),
    ...content.split("\n"),
    ...lines.slice(endLine - 1),
  ];

  await fs.promises.writeFile(name, updated.join("\n"), "utf-8");
  const lintingResult = await lintFile(name);
  if (lintingResult) {
    const newEndLine = endLine + (updated.length - lines.length);
    return (
      "Content inserted:" +
      render(updated, startLine - 4, newEndLine + 4) +
      "\nFile has errors: " +
      lintingResult
    );
  }
  return "File updated with no linting errors remaining.";
}

async function readFile(
  name: string,
  startLine: number,
  endLine: number,
): Promise<string> {
  if (!fs.existsSync(name)) return "Error: File not found.";
  const content = await fs.promises.readFile(name, "utf-8");
  const lines = content.split("\n");

  // If endLine is beyond the end of the file, just return up to the end without error — this allows reading to the end of the file without needing to know its length in advance
  if (startLine > lines.length) {
    return (
      "Error: startLine is beyond end of file. Total lines in file: " +
      lines.length
    );
  }

  const actualEndLine = Math.min(endLine, lines.length + 1);
  if (actualEndLine - startLine > 500) {
    return (
      "Error: Requested line range exceeds maximum of 500 lines. Total lines in file: " +
      lines.length
    );
  }

  const joinedLines = render(lines, startLine, actualEndLine);
  return `Total lines in file: ${lines.length}\n${joinedLines}`;
}

function render(lines: string[], startLine: number, endLine: number) {
  return lines
    .slice(Math.max(0, startLine - 1), Math.min(lines.length, endLine - 1))
    .map((line, i) => `${i + startLine}: ${line}`)
    .join("\n");
}

async function deleteLines(
  name: string,
  startLine: number,
  endLine: number,
): Promise<string> {
  if (!fs.existsSync(name)) return "Error: File not found.";
  const lines = (await fs.promises.readFile(name, "utf-8")).split("\n");
  if (startLine < 1 || startLine > lines.length) {
    return `Error: startLine ${startLine} is out of range. File has ${lines.length} lines.`;
  }
  const actualEnd = Math.min(endLine, lines.length + 1);
  const updated = [
    ...lines.slice(0, startLine - 1),
    ...lines.slice(actualEnd - 1),
  ];
  await fs.promises.writeFile(name, updated.join("\n"), "utf-8");
  const lintingResult = await lintFile(name);
  if (lintingResult) {
    return "Lines deleted, but file has errors: " + lintingResult;
  }
  return `Deleted lines ${startLine}–${actualEnd - 1}. File now has ${updated.length} lines.`;
}

async function deleteFile(name: string): Promise<string> {
  if (!fs.existsSync(name)) return "Error: File not found.";
  const content = await fs.promises.readFile(name, "utf-8");
  const lineCount = content.split("\n").length;
  if (lineCount > 100) {
    return `Delete file failed. 
    Do not delete files more than 100 lines long.
    Rewriting files destroys the version control history.
    Prefer editing incrementally. 
    Use #deleteLines or 'git checkout' when applicable.`;
  }

  await fs.promises.rm(name, { recursive: true });
  let dir = path.dirname(name);
  while (dir !== "." && dir !== "/") {
    const files = await fs.promises.readdir(dir);
    if (files.length === 0) {
      await fs.promises.rmdir(dir);
      dir = path.dirname(dir);
    } else break;
  }
  return "File deleted.";
}

// ── gitignore support ─────────────────────────────────────────────────────────

// Parse a .gitignore file into pattern strings (comments and blanks stripped).
function parseGitignore(gitignorePath: string): string[] {
  if (!fs.existsSync(gitignorePath)) return [];
  return fs
    .readFileSync(gitignorePath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

// Minimal gitignore matcher covering the common cases:
// exact names, leading slash (root-relative), trailing slash (dirs only),
// and single-level wildcards (*).
function matchesGitignore(
  patterns: string[],
  relPath: string,
  isDir: boolean,
): boolean {
  const normRel = relPath.replace(/\\/g, "/");

  for (const raw of patterns) {
    let pattern = raw;

    const dirOnly = pattern.endsWith("/");
    if (dirOnly) {
      if (!isDir) continue;
      pattern = pattern.slice(0, -1);
    }

    const rootAnchored = pattern.startsWith("/");
    if (rootAnchored) pattern = pattern.slice(1);

    // Convert glob pattern to regex (only * is supported, not **)
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*");

    const regex = new RegExp(
      rootAnchored ? `^${regexStr}(/|$)` : `(^|/)${regexStr}(/|$)`,
    );

    if (regex.test(normRel)) return true;
  }
  return false;
}

// Always exclude these regardless of .gitignore
const ALWAYS_EXCLUDE = new Set(["node_modules", ".git"]);

async function listDirectory(
  dirPath: string,
  recursive: boolean = false,
): Promise<string> {
  if (!fs.existsSync(dirPath)) return "Error: Directory not found.";
  const stat = await fs.promises.stat(dirPath);
  if (!stat.isDirectory()) return "Error: Path is not a directory.";

  const gitignorePath = path.join(dirPath, ".gitignore");
  const gitignorePatterns = parseGitignore(gitignorePath);
  const hasGitignore = fs.existsSync(gitignorePath);

  const lines: string[] = [];

  // Always surface .gitignore at the top so the model knows it's there
  if (hasGitignore) {
    lines.push(".gitignore  [gitignore present — patterns applied to listing]");
  }

  async function walk(current: string, indent: string, relBase: string) {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    // Directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      // .gitignore already reported at the top
      if (entry.name === ".gitignore" && current === dirPath) continue;

      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      const isDir = entry.isDirectory();

      // Hard excludes
      if (ALWAYS_EXCLUDE.has(entry.name)) {
        lines.push(`${indent}${entry.name}${isDir ? "/" : ""}  [excluded]`);
        continue;
      }

      // Gitignore excludes
      if (
        gitignorePatterns.length > 0 &&
        matchesGitignore(gitignorePatterns, relPath, isDir)
      ) {
        lines.push(`${indent}${entry.name}${isDir ? "/" : ""}  [gitignored]`);
        continue;
      }

      if (isDir) {
        lines.push(`${indent}${entry.name}/`);
        if (recursive) {
          await walk(path.join(current, entry.name), indent + "  ", relPath);
        }
      } else {
        lines.push(`${indent}${entry.name}`);
      }
    }
  }

  await walk(dirPath, "", "");

  return lines.length === 0 ? "(empty directory)" : lines.join("\n");
}

interface PowerShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function powershell(
  command: string,
  cwd?: string,
): Promise<PowerShellResult> {
  return new Promise((resolve) => {
    child_process.exec(
      `powershell -NoProfile -Command "${command.replace(/"/g, '\\"')}"`,
      { cwd },
      (error, stdout, stderr) => {
        resolve({
          exitCode: error?.code ?? 0,
          stdout: stdout || "",
          stderr: stderr || "",
        });
      },
    );
  });
}

// ── Tool dispatcher ───────────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, any>,
): Promise<string> {
  switch (name) {
    case "createFile":
      return createFile(args.name);
    case "editFile":
      return editFile(args.name, args.startLine, args.endLine, args.content);
    case "readFile":
      return readFile(args.name, args.startLine, args.endLine);
    case "deleteLines":
      return deleteLines(args.name, args.startLine, args.endLine);
    case "deleteFile":
      return deleteFile(args.name);
    case "listDirectory":
      return listDirectory(args.path, args.recursive ?? false);
    case "powershell":
      const result = await powershell(args.command, args.cwd);
      return `Exit Code: ${result.exitCode},
      Std Out: ${result.stdout},
      Std Err: ${result.stderr}`;
    default:
      return `Error: Unknown tool "${name}"`;
  }
}

// Compacting

// ── Context compaction ────────────────────────────────────────────────────────
const COMPACT_THRESHOLD = 45_000; // compact when estimated usage exceeds this

function estimateTokens(
  msgs: OpenAI.Chat.ChatCompletionMessageParam[],
): number {
  // ~4 chars per token is a reliable rough estimate for mixed prose/code
  return Math.ceil(JSON.stringify(msgs).length / 4);
}

async function compactMessages(
  msgs: OpenAI.Chat.ChatCompletionMessageParam[],
): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
  // Calculate the latest user message, starting from most recent and working backwards
  const latestUserIndex = msgs
    .map((m, i) => ({ role: m.role, index: i }))
    .reverse()
    .find((m) => m.role === "user")?.index;

  const newLocal: ChatCompletionMessageParam = {
    role: "system",
    content: "",
  };

  const head = readSystemPromptMessage() ?? newLocal;

  // This should compact everything up to the latest user message
  const toSummarize = msgs.slice(1, latestUserIndex); // middle
  const recent = msgs.slice(latestUserIndex); // recent tail

  if (toSummarize.length === 0) return msgs;

  process.stderr.write(
    `\x1b[2m[compacting: ${toSummarize.length} messages → summary]\x1b[0m\n`,
  );

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      head,
      ...toSummarize,
      {
        role: "user",
        content:
          "Produce a concise but complete summary of the conversation and work done so far. " +
          "Cover: the user's goals, every file created or modified (with key contents), " +
          "decisions made, commands run and their outcomes, and any open tasks. " +
          "Be dense — this replaces the full history. Plain prose, no headers.",
      },
    ],
    temperature: 0,
    max_tokens: 1024,
  });

  const summary = res.choices[0]?.message?.content ?? "(summary unavailable)";
  const before = estimateTokens(msgs);
  const after = estimateTokens([head, ...recent]);

  process.stderr.write(
    `\x1b[2m[compacted: ~${before} → ~${after + Math.ceil(summary.length / 4)} est. tokens]\x1b[0m\n`,
  );

  return [
    head,
    {
      role: "user",
      content: `[Session context summary — replaces earlier history]\n${summary}`,
    },
    {
      role: "assistant",
      content: "Got it, I have the prior context.",
    },
    ...recent,
  ];
}
// ── Persistence ───────────────────────────────────────────────────────────────

const CONVERSATION_FILE = "./conversation.json";

async function loadConversation(): Promise<
  OpenAI.Chat.ChatCompletionMessageParam[]
> {
  try {
    if (fs.existsSync(CONVERSATION_FILE)) {
      const data = await fs.promises.readFile(CONVERSATION_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        process.stderr.write(
          `\x1b[2m[loaded ${parsed.length} messages from ${CONVERSATION_FILE}]\x1b[0m\n`,
        );
        return parsed;
      }
    }
  } catch (e) {
    process.stderr.write(`\x1b[2m[failed to load conversation: ${e}]\x1b[0m\n`);
  }
  return [];
}

async function saveConversation(
  msgs: OpenAI.Chat.ChatCompletionMessageParam[],
) {
  try {
    await fs.promises.writeFile(
      CONVERSATION_FILE,
      JSON.stringify(msgs, null, 2),
      "utf-8",
    );
  } catch (e) {
    process.stderr.write(`\x1b[2m[failed to save conversation: ${e}]\x1b[0m\n`);
  }
}

// ── Agent loop ────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });
const messages: OpenAI.Chat.ChatCompletionMessageParam[] = (
  await loadConversation()
).filter((m) => m.role !== "system");

/**
 * Performs one agent action cycle: sends messages to the model, streams the response,
 * executes any tool calls, and updates the conversation history accordingly.
 *
 * @returns If the loop should continue.
 */
async function actCycle(): Promise<boolean> {
  // Auto-compact if approaching the context limit
  if (estimateTokens(messages) > COMPACT_THRESHOLD) {
    const compacted = await compactMessages(messages);
    messages.splice(0, messages.length, ...compacted);
  } else {
    // Print out the amount of context used as a percentage
    const usage = estimateTokens(messages);
    const percent = ((usage / COMPACT_THRESHOLD) * 100).toFixed(1);
    process.stderr.write(
      `\x1b[2m[context usage: ~${usage} tokens, ${percent}% of threshold]\x1b[0m\n`,
    );
  }

  let response;
  try {
    response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0,
      max_tokens: 8192,
      stream: true,
    });
  } catch (e: any) {
    process.stdout.write(`\n[API error: ${e.message}]\n`);
    messages.push({
      role: "user",
      content: `Your last request failed with an API error: ${e.message}. Please try again, potentially with smaller content chunks.`,
    });
    return true; // re-enter the loop
  }

  // Accumulate streamed response
  let assistantContent = "";
  const toolCalls: Record<string, { name: string; arguments: string }> = {};
  let completionTokens = 0;
  let totalTimeMs = 0;
  let draftN = 0;
  let draftAccepted = 0;

  for await (const chunk of response) {
    const raw = chunk as any;
    const delta = chunk.choices[0]?.delta;
    const finishReason = chunk.choices[0]?.finish_reason;

    if (finishReason === "stop") {
      completionTokens = raw.timings?.predicted_n ?? 0;
      totalTimeMs = raw.timings?.predicted_ms ?? 0;
      draftN = raw.timings?.draft_n ?? 0;
      draftAccepted = raw.timings?.draft_n_accepted ?? 0;
      break;
    }

    if (!delta) {
      continue;
    }

    const reasoning_content = (delta as any).reasoning_content;
    if (reasoning_content) {
      process.stdout.write(`\x1b[2m${reasoning_content}\x1b[0m`);
    }

    if (delta.content) {
      process.stdout.write(delta.content);
      assistantContent += delta.content;
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const id = tc.index.toString();
        if (!toolCalls[id]) {
          toolCalls[id] = { name: tc.function?.name ?? "", arguments: "" };
        }
        if (tc.function?.name) toolCalls[id].name = tc.function.name;
        if (tc.function?.arguments)
          toolCalls[id].arguments += tc.function.arguments;
      }
    }
  }

  // Print timing stats
  if (completionTokens > 0 && totalTimeMs > 0) {
    const tps = (completionTokens / (totalTimeMs / 1000)).toFixed(1);
    const acceptRate =
      draftN > 0
        ? ` | draft ${((draftAccepted / draftN) * 100).toFixed(0)}% accepted`
        : "";
    process.stdout.write(
      `\n\x1b[2m[${tps} TPS | ${completionTokens} tokens${acceptRate}]\x1b[0m`,
    );
  }

  // Build assistant message
  const toolCallList = Object.entries(toolCalls).map(([index, tc]) => ({
    id: `call_${index}`,
    type: "function" as const,
    function: { name: tc.name, arguments: tc.arguments },
  }));

  const assistantMsg: OpenAI.Chat.ChatCompletionMessageParam = {
    role: "assistant",
    content: assistantContent || null,
    ...(toolCallList.length > 0 && { tool_calls: toolCallList }),
  };
  messages.push(assistantMsg);

  if (toolCallList.length === 0) return false;

  // Execute tool calls
  for (const tc of toolCallList) {
    let args: Record<string, any> = {};
    try {
      args = JSON.parse(tc.function.arguments);
    } catch {
      args = {};
    }

    process.stdout.write(`\n[${tc.function.name}(${JSON.stringify(args)})]\n`);
    const result = await callTool(tc.function.name, args);
    process.stdout.write(`→ ${result}\n`);

    messages.push({
      role: "tool",
      tool_call_id: tc.id,
      content: result,
    });
  }

  process.stdout.write("Bot: ");
  return true;
}

async function act() {
  // Agentic loop — keep going until model stops calling tools
  while (true) {
    const shouldContinue = await actCycle();
    if (!shouldContinue) break;
  }

  // Execute `Stop.ps1` if it exists to check for errors after each agent turn
  // Collect stdErr and stdOutput and give it to the model if we hit a non-zero exit code
  if (fs.existsSync("Stop.ps1")) {
    const stopResult = await new Promise<{
      exitCode: number;
      output: string;
    }>((resolve) => {
      child_process.exec(
        "powershell -ExecutionPolicy Bypass -File Stop.ps1",
        (error, stdout, stderr) => {
          const exitCode = (error as any)?.code ?? 0;
          const output = [stdout, stderr].filter(Boolean).join("\n").trim();
          resolve({ exitCode, output });
        },
      );
    });

    if (stopResult.exitCode !== 0) {
      const msg = stopResult.output || "(no output)";
      process.stdout.write(
        `\n[Stop.ps1 failed (exit ${stopResult.exitCode})]\n${msg}\n`,
      );
      messages.push({
        role: "user",
        content: `Stop hook exited with code ${stopResult.exitCode}. You MUST fix these issues before continuing. Do NOT adjust the project configuration when fixing issues reported by the stop hook:\n${msg}`,
      });
      await act();
    } else {
      process.stdout.write(
        `\n[Stop.ps1] No issues detected: ${stopResult.output}\n`,
      );
    }
  } else {
    process.stdout.write(
      `\n[Stop.ps1] No stop hook found at file of absolute path: ${process.cwd()}\\Stop.ps1, skipping.\n`,
    );
  }
}

function readSystemPromptMessage(): ChatCompletionMessageParam | undefined {
  if (fs.existsSync("./AGENTS.md")) {
    const prompt = fs.readFileSync("./AGENTS.md", "utf-8");
    return {
      role: "system",
      content: prompt,
    };
  }
  return undefined;
}

const promptMessage = readSystemPromptMessage();
if (promptMessage) {
  messages.unshift(promptMessage);
}

while (true) {
  const input = await rl.question("You: ");
  // if input is equal to /compact we should auto-compact
  if (input.trim() === "/compact") {
    const compacted = await compactMessages(messages);
    messages.splice(0, messages.length, ...compacted);
    continue;
  }

  messages.push({ role: "user", content: input });
  process.stdout.write("Bot: ");
  await act();

  // Save after each complete turn
  await saveConversation(messages);
  process.stdout.write("\n");
}
