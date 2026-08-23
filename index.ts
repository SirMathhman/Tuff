console.log("Hello via Bun!");

export function evaluate(input: string): number {
  if (input.trim() === "") return 0;
  return new Function(`return (function() { ${input} })();`)();
}
