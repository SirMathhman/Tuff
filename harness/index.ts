import { Chat, LMStudioClient } from "@lmstudio/sdk";
import { createInterface } from "readline/promises";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const client = new LMStudioClient();
const model = await client.llm.model();
const chat = Chat.empty();

while (true) {
  const input = await rl.question("You: ");
  // Append the user input to the chat
  chat.append("user", input);

  const prediction = model.respond(chat, {
    // When the model finish the entire message, push it to the chat
    onMessage: (message) => chat.append(message),
  });
  process.stdout.write("Bot: ");
  for await (const { content } of prediction) {
    process.stdout.write(content);
  }
  process.stdout.write("\n");
}
