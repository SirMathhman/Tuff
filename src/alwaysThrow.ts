export function alwaysThrow(message: string): string {
  if (message === "boom") throw new Error(message);
  return message;
}
