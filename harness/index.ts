import { Chat, LMStudioClient, tool } from "@lmstudio/sdk";
import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { createInterface } from "readline/promises";
import { z } from "zod";
import * as fs from "fs/promises";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const client = new LMStudioClient();
const model = await client.llm.model();
const chat = Chat.empty();

const createFileTool = tool({
  name: "createFile",
  description: "Create a file with the given name and content.",
  parameters: { name: z.string(), content: z.string() },
  implementation: async ({ name, content }) => {
    if (existsSync(name)) {
      return "Error: File already exists.";
    }
    await writeFile(name, content, "utf-8");
    return "File created.";
  },
});

const readFileTool = tool({
  name: "readFile",
  description: `Read the content of a file with the given name, given the start and ending line numbers.
    If the file is not found, an error message will be returned. 
    If the line numbers are invalid, an error message will be returned.`,
  parameters: { name: z.string(), startLine: z.number(), endLine: z.number() },
  implementation: async ({ name, startLine, endLine }) => {
    if (!existsSync(name)) {
      return (
        "Error: File not found. Existing files: " +
        (await fs.readdir(".")).join(", ")
      );
    }

    const content = await fs.readFile(name, "utf-8");
    const lines = content.split("\n");
    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
      return (
        "Error: Invalid line numbers. The file has " + lines.length + " lines."
      );
    }

    return lines.slice(startLine - 1, endLine).join("\n");
  },
});

const editFileTool = tool({
  name: "editFile",
  description: `Edit a file with the given name by replacing the content between the start and ending line numbers with the new content.
    If the file is not found, an error message will be returned.
    If the line numbers are invalid, an error message will be returned.`,
  parameters: {
    name: z.string(),
    startLine: z.number(),
    endLine: z.number(),
    newContent: z.string(),
  },
  implementation: async ({ name, startLine, endLine, newContent }) => {
    if (!existsSync(name)) {
      return (
        "Error: File not found. Existing files: " +
        (await fs.readdir(".")).join(", ")
      );
    }

    const content = await fs.readFile(name, "utf-8");
    const lines = content.split("\n");
    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
      return (
        "Error: Invalid line numbers. The file has " + lines.length + " lines."
      );
    }

    lines.splice(startLine - 1, endLine - startLine + 1, newContent);
    await fs.writeFile(name, lines.join("\n"), "utf-8");
    return "File edited.";
  },
});

const deleteFileTool = tool({
  name: "deleteFile",
  description:
    "Delete a file with the given name. If the file is not found, an error message will be returned.",
  parameters: { name: z.string() },
  implementation: async ({ name }) => {
    if (!existsSync(name)) {
      return (
        "Error: File not found. Existing files: " +
        (await fs.readdir(".")).join(", ")
      );
    }
    await fs.rm(name);
    return "File deleted.";
  },
});

while (true) {
  const input = await rl.question("You: ");
  // Append the user input to the chat
  chat.append("user", input);

  process.stdout.write("Bot: ");
  const tools = [createFileTool, readFileTool, editFileTool, deleteFileTool];
  await model.act(chat, tools, {
    // When the model finish the entire message, push it to the chat
    onMessage: (message) => chat.append(message),
    onPredictionFragment: ({ content }) => {
      process.stdout.write(content);
    },
  });
  process.stdout.write("\n");
}
