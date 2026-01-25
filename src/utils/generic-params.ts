export function parseGenericParams(s: string): {
  name: string;
  params: string[];
} {
  const angleStart = s.indexOf("<");
  if (angleStart === -1) return { name: s.trim(), params: [] };
  const angleEnd = s.indexOf(">");
  if (angleEnd === -1) return { name: s.trim(), params: [] };
  const name = s.slice(0, angleStart).trim();
  const paramStr = s.slice(angleStart + 1, angleEnd).trim();
  return {
    name,
    params: paramStr ? paramStr.split(",").map((p) => p.trim()) : [],
  };
}
