// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt, stringSlice } from "../rt/stdlib.mjs";
import { panic_at } from "../util/diagnostics.mjs";
import { skip_ws } from "../util/lexing.mjs";
import { ParsedIdent, ParsedNumber, parse_ident, parse_keyword, parse_number } from "./primitives.mjs";
import { is_ident_start, is_ident_part } from "../util/lexing.mjs";
export function ParsedType(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedDropSuffix(hasIt, name, nextPos) {
return { hasIt: hasIt, name: name, nextPos: nextPos };
}
export function parse_drop_suffix(src, i) {
const k = skip_ws(src, i);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 33) {
const afterBang = k + 1;
if (afterBang < stringLen(src) && is_ident_start(stringCharCodeAt(src, afterBang))) {
const ident = parse_ident(src, afterBang);
return ParsedDropSuffix(true, ident.text, ident.nextPos);
}
}
return ParsedDropSuffix(false, "", i);
}
export function skip_angle_brackets(src, i) {
let k = skip_ws(src, i);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 60)) {
panic_at(src, k, "expected '<'");
}
k = k + 1;
let depth = 1;
while (k < stringLen(src)) {
const ch = stringCharCodeAt(src, k);
if (ch == 60) {
depth = depth + 1;
k = k + 1;
continue;
}
if (ch == 62) {
depth = depth - 1;
k = k + 1;
if (depth == 0) {
return k;
}
continue;
}
k = k + 1;
}
return panic_at(src, k, "unterminated '<...>'");
}
export function parse_type_expr(src, i) {
let k = skip_ws(src, i);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected type");
}
const c = stringCharCodeAt(src, k);
if (c == 42) {
const afterStar = k + 1;
const mutPos = skip_ws(src, afterStar);
if (mutPos + 2 < stringLen(src) && stringCharCodeAt(src, mutPos) == 109 && stringCharCodeAt(src, mutPos + 1) == 117 && stringCharCodeAt(src, mutPos + 2) == 116) {
const afterMut = mutPos + 3;
if (afterMut >= stringLen(src) || !is_ident_part(stringCharCodeAt(src, afterMut))) {
const inner = parse_type_expr(src, afterMut);
const base = "*mut " + inner.v0;
const drop = parse_drop_suffix(src, inner.v1);
if (drop.hasIt) {
return ParsedType(base + "!" + drop.name, drop.nextPos);
}
return ParsedType(base, inner.v1);
}
}
k = k + 1;
k = parse_keyword(src, k, "[");
const inner = parse_type_expr(src, k);
k = inner.v1;
k = parse_keyword(src, k, "]");
const base = "*[" + inner.v0 + "]";
const drop = parse_drop_suffix(src, k);
if (drop.hasIt) {
return ParsedType(base + "!" + drop.name, drop.nextPos);
}
return ParsedType(base, k);
}
if (c == 91) {
k = parse_keyword(src, k, "[");
const inner = parse_type_expr(src, k);
k = inner.v1;
let sizes = "";
while (true) {
const t = skip_ws(src, k);
if (!(t < stringLen(src) && stringCharCodeAt(src, t) == 59)) {
break;
}
const n = parse_number(src, t + 1);
sizes = sizes + ";" + ("" + n.value);
k = n.nextPos;
}
k = parse_keyword(src, k, "]");
const base = "[" + inner.v0 + sizes + "]";
const drop = parse_drop_suffix(src, k);
if (drop.hasIt) {
return ParsedType(base + "!" + drop.name, drop.nextPos);
}
return ParsedType(base, k);
}
if (c == 40) {
k = parse_keyword(src, k, "(");
k = skip_ws(src, k);
let parts = "";
let first = true;
if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) {
k = k + 1;
} else {
while (true) {
const t1 = parse_type_expr(src, k);
k = t1.v1;
if (first) {
parts = parts + t1.v0;
} else {
parts = parts + ", " + t1.v0;
}
first = false;
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected ')' in type");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
k = k + 1;
continue;
}
if (ch == 41) {
k = k + 1;
break;
}
panic_at(src, k, "expected ',' or ')' in type");
}
}
const t2 = skip_ws(src, k);
if (t2 + 1 < stringLen(src) && stringCharCodeAt(src, t2) == 61 && stringCharCodeAt(src, t2 + 1) == 62) {
const ret = parse_type_expr(src, t2 + 2);
const base = "(" + parts + ") => " + ret.v0;
const drop = parse_drop_suffix(src, ret.v1);
if (drop.hasIt) {
return ParsedType(base + "!" + drop.name, drop.nextPos);
}
return ParsedType(base, ret.v1);
}
const base = "(" + parts + ")";
const drop = parse_drop_suffix(src, k);
if (drop.hasIt) {
return ParsedType(base + "!" + drop.name, drop.nextPos);
}
return ParsedType(base, k);
}
const name = parse_ident(src, k);
k = name.nextPos;
let out = name.text;
if (name.text == "Any") {
panic_at(src, name.startPos, "type 'Any' is unsupported");
}
const t3 = skip_ws(src, k);
if (t3 < stringLen(src) && stringCharCodeAt(src, t3) == 60) {
k = parse_keyword(src, t3, "<");
let args = "";
let firstArg = true;
while (true) {
const a = parse_type_expr(src, k);
k = a.v1;
if (firstArg) {
args = args + a.v0;
} else {
args = args + ", " + a.v0;
}
firstArg = false;
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected '>' in generic type");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
k = k + 1;
continue;
}
if (ch == 62) {
k = k + 1;
break;
}
panic_at(src, k, "expected ',' or '>' in generic type");
}
out = out + "<" + args + ">";
}
const drop = parse_drop_suffix(src, k);
if (drop.hasIt) {
return ParsedType(out + "!" + drop.name, drop.nextPos);
}
return ParsedType(out, k);
}
export function skip_type_expr(src, i) {
let k = skip_ws(src, i);
let depth = 0;
while (k < stringLen(src)) {
const ch = stringCharCodeAt(src, k);
if (ch == 60) {
depth = depth + 1;
k = k + 1;
continue;
}
if (ch == 62) {
if (depth > 0) {
depth = depth - 1;
}
k = k + 1;
continue;
}
if (depth == 0 && (ch == 44 || ch == 59 || ch == 125)) {
return k;
}
k = k + 1;
}
return panic_at(src, k, "unterminated type");
}
