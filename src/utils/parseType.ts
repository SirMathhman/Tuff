import { Token } from "../tokenize";

export interface TypeParseResult {
  typeName: string;
  nextIndex: number;
}

export function parseTypeNameAt(
  tokensArr: Token[],
  i: number
): TypeParseResult | undefined {
  const tok = tokensArr[i];
  if (!tok) return undefined;
  if (tok.type === "ident") return { typeName: tok.value, nextIndex: i + 1 };
  if (tok.type === "op" && tok.value === "*") {
    let j = i + 1;
    let mut = false;
    if (
      tokensArr[j] &&
      tokensArr[j].type === "ident" &&
      tokensArr[j].value === "mut"
    ) {
      mut = true;
      j++;
    }
    const baseTok = tokensArr[j];
    if (!baseTok || baseTok.type !== "ident") return undefined;
    const tname = mut ? `*mut ${baseTok.value}` : `*${baseTok.value}`;
    return { typeName: tname, nextIndex: j + 1 };
  }
  return undefined;
}
