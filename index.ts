export function executeTuff(source: string): number {
  if (source.trim() === "") return 0;
  throw new Error("Default error, invalid source: " + source);
}
