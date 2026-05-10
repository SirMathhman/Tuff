import OpenAI from "openai";
import * as fs from "fs";
import { writeFile } from "fs/promises";
import { createInterface } from "readline/promises";
import * as path from "path";
import * as child_process from "child_process";

// ── Client ────────────────────────────────────────────────────────────────────

const client = new OpenAI({
  baseURL: "http://127.0.0.1:8080/v1",
  apiKey: "dummy",
});

const MODEL = "Qwen3.6-27B-Q4_K_M-mtp.gguf";

// ── Tool definitions (OpenAI schema) ─────────────────────────────────────────

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "createFile",
      description:
        "Create a file with the given name and content. Creates parent directories automatically.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Path to the file to create" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["name", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editFile",
      description:
        "Edit an existing file. startLine is inclusive, endLine is exclusive. Line numbers start at 1.",
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
      description:
        "Read a file and return its content with line numbers starting at 1.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteFile",
      description:
        "Delete a file. Recursively removes empty parent directories.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
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

async function createFile(name: string, content: string): Promise<string> {
  if (fs.existsSync(name)) return "Error: File already exists.";
  const dir = path.dirname(name);
  if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
  await writeFile(name, content, "utf-8");
  return "File created.";
}

async function editFile(
  name: string,
  startLine: number,
  endLine: number,
  content: string,
): Promise<string> {
  if (!fs.existsSync(name)) return "Error: File not found.";
  const lines = (await fs.promises.readFile(name, "utf-8")).split("\n");
  const updated = [
    ...lines.slice(0, startLine - 1),
    ...content.split("\n"),
    ...lines.slice(endLine - 1),
  ].join("\n");
  await fs.promises.writeFile(name, updated, "utf-8");
  return "File updated.";
}

async function readFile(name: string): Promise<string> {
  if (!fs.existsSync(name)) return "Error: File not found.";
  const content = await fs.promises.readFile(name, "utf-8");
  return content
    .split("\n")
    .map((line, i) => `${i + 1}: ${line}`)
    .join("\n");
}

async function deleteFile(name: string): Promise<string> {
  if (!fs.existsSync(name)) return "Error: File not found.";
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

async function powershell(command: string, cwd?: string): Promise<string> {
  return new Promise((resolve) => {
    child_process.exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) resolve(`Error: ${error.message}`);
      else if (stderr) resolve(`Stderr: ${stderr}`);
      else resolve(stdout || "(no output)");
    });
  });
}

// ── Tool dispatcher ───────────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, any>,
): Promise<string> {
  switch (name) {
    case "createFile":
      return createFile(args.name, args.content);
    case "editFile":
      return editFile(args.name, args.startLine, args.endLine, args.content);
    case "readFile":
      return readFile(args.name);
    case "deleteFile":
      return deleteFile(args.name);
    case "listDirectory":
      return listDirectory(args.path, args.recursive ?? false);
    case "powershell":
      return powershell(args.command, args.cwd);
    default:
      return `Error: Unknown tool "${name}"`;
  }
}

// Compacting

// ── Context compaction ────────────────────────────────────────────────────────

const MAX_CONTEXT_TOKENS = 13170;
const COMPACT_THRESHOLD = 10000; // compact when estimated usage exceeds this
const KEEP_RECENT = 8; // always preserve this many tail messages verbatim

function estimateTokens(
  msgs: OpenAI.Chat.ChatCompletionMessageParam[],
): number {
  // ~4 chars per token is a reliable rough estimate for mixed prose/code
  return Math.ceil(JSON.stringify(msgs).length / 4);
}

async function compactMessages(
  msgs: OpenAI.Chat.ChatCompletionMessageParam[],
): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
  if (msgs.length <= KEEP_RECENT) return msgs;

  const toSummarize = msgs.slice(0, msgs.length - KEEP_RECENT);
  const recent = msgs.slice(msgs.length - KEEP_RECENT);

  process.stderr.write(
    `\x1b[2m[compacting: ${toSummarize.length} messages → summary]\x1b[0m\n`,
  );

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
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
    temperature: 0.1,
    max_tokens: 1024,
  });

  const summary = res.choices[0]?.message?.content ?? "(summary unavailable)";
  const before = estimateTokens(msgs);
  const after = estimateTokens([...recent]); // rough; summary adds ~summary.length/4

  process.stderr.write(
    `\x1b[2m[compacted: ~${before} → ~${after + Math.ceil(summary.length / 4)} est. tokens]\x1b[0m\n`,
  );

  return [
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

// ── Agent loop ────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });
const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

while (true) {
  const input = await rl.question("You: ");
  messages.push({ role: "user", content: input });

  process.stdout.write("Bot: ");

  // Agentic loop — keep going until model stops calling tools
  while (true) {
    // Auto-compact if approaching the context limit
    if (estimateTokens(messages) > COMPACT_THRESHOLD) {
      const compacted = await compactMessages(messages);
      messages.splice(0, messages.length, ...compacted);
    }

    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 8192,
      stream: true,
    });

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
        continue;
      }

      if (!delta) {
        continue;
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

    if (toolCallList.length === 0) break;

    // Execute tool calls
    for (const tc of toolCallList) {
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      process.stdout.write(
        `\n[${tc.function.name}(${JSON.stringify(args)})]\n`,
      );
      const result = await callTool(tc.function.name, args);
      process.stdout.write(`→ ${result}\n`);

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }

    process.stdout.write("Bot: ");
  }

  process.stdout.write("\n");
}
