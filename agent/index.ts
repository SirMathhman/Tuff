import { Chat, LMStudioClient, tool } from "@lmstudio/sdk";
import * as fs from "fs";
import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { createInterface } from "readline/promises";
import { z } from "zod";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const client = new LMStudioClient();
const model = await client.llm.model();
const chat = Chat.empty();

const createFile = tool({
  name: "createFile",
  description:
    "Create a file with the given name and content. Creates parent directories",
  parameters: { name: z.string(), content: z.string() },
  implementation: async ({ name, content }) => {
    if (fs.existsSync(name)) {
      return "Error: File already exists.";
    }

    // Create the parent directories.
    const dir = require("path").dirname(name);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    await writeFile(name, content, "utf-8");
    return "File created.";
  },
});

const editFile = tool({
  name: "editFile",
  description: `Edit an existing file with the given name and content. 
  Start line inclusive, end line exclusive.
  Requires old and new content.`,
  parameters: {
    name: z.string(),
    startLine: z.number(),
    endLine: z.number(),
    contentOld: z.string(),
    contentNew: z.string(),
  },
  implementation: async ({
    name,
    startLine,
    endLine,
    contentOld: oldContent,
    contentNew: newContent,
  }) => {
    if (!fs.existsSync(name)) {
      return "Error: File not found.";
    }

    const fileContent = await fs.promises.readFile(name, "utf-8");
    const fileLines = fileContent.split("\n");
    const linesToEdit = fileLines.slice(startLine, endLine);
    const linesToEditContent = linesToEdit.join("\n");
    if (linesToEditContent.trim() !== oldContent.trim()) {
      return "Error: Old content does not match the content in the file.";
    }
    const newFileContent = [
      ...fileLines.slice(0, startLine),
      ...newContent.split("\n"),
      ...fileLines.slice(endLine),
    ].join("\n");

    await fs.promises.writeFile(name, newFileContent, "utf-8");
    return "File updated.";
  },
});

const readFile = tool({
  name: "readFile",
  description:
    "Read the content of a file with the given name. Provides line numbers.",
  parameters: { name: z.string() },
  implementation: async ({ name }) => {
    if (!fs.existsSync(name)) {
      return "Error: File not found.";
    }
    const content = await fs.promises.readFile(name, "utf-8");
    return content
      .split("\n")
      .map((line: string, index: number) => `${index}: ${line}`)
      .join("\n");
  },
});

const deleteFile = tool({
  name: "deleteFile",
  description:
    "Delete a file with the given name. Recursively deletes empty parent directories.",
  parameters: { name: z.string() },
  implementation: async ({ name }) => {
    if (!fs.existsSync(name)) {
      return "Error: File not found.";
    }

    await fs.promises.rm(name, { recursive: true });

    // Recursively delete empty parent directories
    let currentDir = require("path").dirname(name);
    while (currentDir !== "." && currentDir !== "/") {
      const files = await fs.promises.readdir(currentDir);
      if (files.length === 0) {
        await fs.promises.rmdir(currentDir);
        currentDir = require("path").dirname(currentDir);
      } else {
        break;
      }
    }

    return "File deleted.";
  },
});

while (true) {
  const input = await rl.question("You: ");
  // Append the user input to the chat
  chat.append("user", input);

  process.stdout.write("Bot: ");
  await model.act(chat, [createFile, editFile, readFile, deleteFile], {
    // When the model finish the entire message, push it to the chat
    onMessage: (message) => chat.append(message),
    onPredictionFragment: ({ content }) => {
      process.stdout.write(content);
    },
  });
  process.stdout.write("\n");
}
