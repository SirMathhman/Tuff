export function execute(source) {
  if (!source || source.trim().length === 0) return 0;
  throw new Error("Invalid source: " + source);
}
