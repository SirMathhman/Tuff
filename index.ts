console.log("Hello via Bun!");

export function evaluate(input: string): number {
  if (input.trim() === "") return 0;
  const js = input.replace(/\blet\s+mut\b/g, "let");
  return new Function(`return (function() { ${js} })();`)();
}
