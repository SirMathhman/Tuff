import { Chat, LMStudioClient, tool } from "@lmstudio/sdk";
import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { createInterface } from "readline/promises";
import { z } from "zod";
import * as fs from "fs/promises";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const client = new LMStudioClient();
const model = await client.llm.model();

// Load the chat from the chat file
let chat: Chat;
if (await fs.exists("chat.json")) {
  console.log("Loading chat from chat.json...");
  const chatData = await fs.readFile("chat.json", "utf-8");
  chat = Chat.from(JSON.parse(chatData));
} else {
  console.log("No existing chat found. Starting a new chat...");
  chat = Chat.empty();
}

const createFileTool = tool({
  name: "createFile",
  description: `Create a file with the given name.
  The parent directory will be created if it does not exist. 
  If a file with the same name already exists, an error message will be returned.
  To add content to this file, you must then edit it afterwards.
  `,

  parameters: { name: z.string() },
  implementation: async ({ name }) => {
    if (existsSync(name)) {
      return "Error: File already exists.";
    }

    // Create parent directory
    const parentDir = name.split("/").slice(0, -1).join("/");
    if (parentDir && !existsSync(parentDir)) {
      await fs.mkdir(parentDir, { recursive: true });
    }

    await writeFile(name, "", "utf-8");
    return "File succesfully created at: " + name;
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
    If the line numbers are invalid, an error message will be returned.
    The maximum number of lines that can be replaced at once is 20 lines. 
    If more lines need to be replaced, the tool can be called multiple times.`,
  parameters: {
    name: z.string(),
    startLine: z.number(),
    endLine: z.number(),
    newContent: z.string(),
  },
  implementation: async ({ name, startLine, endLine, newContent }) => {
    if (endLine - startLine + 1 > 20) {
      return "Error: Too many lines to replace at once. Maximum is 20 lines.";
    }

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
  description: `Delete a file with the given name. 
    If the file is not found, an error message will be returned.
    If the directory is empty after the file is deleted, the directory will also be deleted, recursively.
    The only exception to this is the root.`,

  parameters: { name: z.string() },
  implementation: async ({ name }) => {
    if (!existsSync(name)) {
      return (
        "Error: File not found. Existing files: " +
        (await fs.readdir(".")).join(", ")
      );
    }

    await fs.rm(name);
    // Recursively delete empty parent directories
    let parentDir = name.split("/").slice(0, -1).join("/");
    while (parentDir && parentDir !== "." && existsSync(parentDir)) {
      const files = await fs.readdir(parentDir);
      if (files.length === 0) {
        await fs.rmdir(parentDir);
        parentDir = parentDir.split("/").slice(0, -1).join("");
      } else {
        break;
      }
    }

    return "File deleted.";
  },
});

const powerShellTool = tool({
  name: "powerShell",
  description: `Execute a PowerShell command and return the output.
    If the command fails, an error message will be returned.`,
  parameters: { command: z.string() },
  implementation: async ({ command }) => {
    const { exec } = await import("child_process");
    return new Promise((resolve) => {
      exec(command, { shell: "powershell.exe" }, (error, stdout, stderr) => {
        if (error) {
          resolve(`Error: ${error.message}`);
        } else if (stderr) {
          resolve(`Error: ${stderr}`);
        } else {
          resolve(stdout);
        }
      });
    });
  },
});

while (true) {
  const input = await rl.question("You: ");
  if (input.toLowerCase() === "exit") {
    break;
  }

  // Append the user input to the chat
  chat.append("user", input);

  process.stdout.write("Bot: ");
  const tools = [
    createFileTool,
    readFileTool,
    editFileTool,
    deleteFileTool,
    powerShellTool,
  ];
  await model.act(chat, tools, {
    // When the model finish the entire message, push it to the chat
    onMessage: (message) => chat.append(message),
    onPredictionFragment: ({ content }) => {
      process.stdout.write(content);
    },
  });
  process.stdout.write("\n");
}

// Save the chat to the chat file
await fs.writeFile("chat", JSON.stringify(chat), "utf-8");
process.exit(0);
