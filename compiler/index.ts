export function executeTuff(tuffSourceCode: string): number {
  if (tuffSourceCode === "") {
    return 0;
  }
  const match = tuffSourceCode.match(/^(\d+)/);
  if (!match || !match[1]) {
    throw new Error("Invalid format");
  }
  return parseInt(match[1], 10);
}

