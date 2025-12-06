export function handleMessage(message: string): string {
  if (message === "boom") throw new Error(message);
    const match = message.match(/^\d+/);
    return match ? match[0] : message;
}
