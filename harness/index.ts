import { Chat, LMStudioClient, tool } from "@lmstudio/sdk";
import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { createInterface } from "readline/promises";
import { z } from "zod";

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

while (true) {
  const input = await rl.question("You: ");
  // Append the user input to the chat
  chat.append("user", input);

  process.stdout.write("Bot: ");
  await model.act(chat, [createFileTool], {
    // When the model finish the entire message, push it to the chat
    onMessage: (message) => chat.append(message),
    onPredictionFragment: ({ content }) => {
      process.stdout.write(content);
    },
  });
  process.stdout.write("\n");
}
