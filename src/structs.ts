import { Token } from "./tokenize";
import { Result, ok, err, isErr } from "./result";
import { StructField } from "./matchEval";
import { findMatchingBrace } from "./commonUtils";

export interface StructParseResult {
  name: string;
  fields: StructField[];
  nextIndex: number;
}

interface FieldParseResult {
  field: StructField;
  nextIndex: number;
}

interface StructHeaderResult {
  name: string;
  braceStart: number;
  braceEnd: number;
}

function parseSingleField(
  tokensArr: Token[],
  start: number
): Result<FieldParseResult, string> {
  let cur = start;

  if (cur >= tokensArr.length || tokensArr[cur].type !== "ident") {
    return err("Invalid struct field");
  }
  const fieldName = tokensArr[cur].value as string;
  cur++;

  if (
    !tokensArr[cur] ||
    tokensArr[cur].type !== "punct" ||
    tokensArr[cur].value !== ":"
  ) {
    return err("Invalid struct field: missing type annotation");
  }
  cur++;

  const typeTok = tokensArr[cur];
  if (!typeTok || typeTok.type !== "ident") {
    return err("Invalid struct field: missing type");
  }
  const fieldType = typeTok.value as string;
  cur++;

  return ok({
    field: { name: fieldName, typeName: fieldType },
    nextIndex: cur,
  });
}

function parseStructHeader(
  tokensArr: Token[],
  idx: number
): Result<StructHeaderResult, string> {
  if (
    !tokensArr[idx] ||
    tokensArr[idx].type !== "ident" ||
    (tokensArr[idx].value as string) !== "struct"
  ) {
    return err("Invalid struct definition");
  }

  const nameTok = tokensArr[idx + 1];
  if (!nameTok || nameTok.type !== "ident") return err("Invalid struct name");
  const name = nameTok.value as string;

  const braceTok = tokensArr[idx + 2];
  if (!braceTok || braceTok.type !== "punct" || braceTok.value !== "{") {
    return err("Invalid struct definition: expected {");
  }

  const braceStart = idx + 2;
  const braceEnd = findMatchingBrace(tokensArr, braceStart);
  if (braceEnd === -1)
    return err("Invalid struct definition: unmatched braces");

  return ok({ name, braceStart, braceEnd });
}

function parseStructFields(
  tokensArr: Token[],
  braceStart: number,
  braceEnd: number
): Result<StructField[], string> {
  const fields: StructField[] = [];
  let fieldIdx = braceStart + 1;

  while (fieldIdx < braceEnd) {
    const tk = tokensArr[fieldIdx];
    if (tk.type === "punct" && tk.value === ",") {
      fieldIdx++;
    } else {
      const fieldRes = parseSingleField(tokensArr, fieldIdx);
      if (isErr(fieldRes)) return err(fieldRes.error);
      fields.push(fieldRes.value.field);
      fieldIdx = fieldRes.value.nextIndex;

      if (fieldIdx < braceEnd) {
        const sepTok = tokensArr[fieldIdx];
        if (sepTok.type === "punct" && sepTok.value === ",") {
          fieldIdx++;
        } else {
          return err("Invalid struct definition: expected , or }");
        }
      }
    }
  }

  if (fields.length === 0) {
    return err("Invalid struct definition: at least one field required");
  }

  return ok(fields);
}

function maybeConsumeSemicolon(tokensArr: Token[], idx: number): number {
  const tk = tokensArr[idx];
  if (tk && tk.type === "punct" && tk.value === ";") return idx + 1;
  return idx;
}

export function parseStructDefinition(
  tokensArr: Token[],
  idx: number
): Result<StructParseResult, string> {
  const headerRes = parseStructHeader(tokensArr, idx);
  if (isErr(headerRes)) return err(headerRes.error);
  const { name, braceStart, braceEnd } = headerRes.value;

  const fieldsRes = parseStructFields(tokensArr, braceStart, braceEnd);
  if (isErr(fieldsRes)) return err(fieldsRes.error);
  const fields = fieldsRes.value;

  const nextIdx = maybeConsumeSemicolon(tokensArr, braceEnd + 1);

  return ok({
    name,
    fields,
    nextIndex: nextIdx,
  });
}
