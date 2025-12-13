// compiled by selfhost tuffc
import { vec_new, vec_len, vec_push, vec_get } from "../rt/vec.mjs";
import { stringLen } from "../rt/stdlib.mjs";
import { panic_at, reset_struct_defs } from "./diagnostics.mjs";
import { skip_ws, starts_with_at, tokenize_with_trivia, TokenStream } from "./lexing.mjs";
import { parse_keyword, parse_optional_semicolon, parse_required_semicolon, parse_ident } from "../parsing/primitives.mjs";
import { parse_type_expr } from "../parsing/types.mjs";
import { parse_expr_ast, parse_mut_opt } from "../parsing/expr_stmt.mjs";
import { parse_imports_ast, parse_extern_decl_ast, parse_module_decl_ast, parse_fn_decl_ast2, parse_class_fn_decl_ast2, parse_struct_decl_ast, parse_type_union_decl_ast } from "../parsing/decls.mjs";
import { span, decl_let } from "../ast.mjs";
export function ParsedProgramWithTrivia(decls, tokenStream, nextPos) {
return { decls: decls, tokenStream: tokenStream, nextPos: nextPos };
}
export function parse_program_decls_ast(src, exportAll) {
const decls = vec_new();
let i = 0;
reset_struct_defs();
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "extern")) {
const ex = parse_extern_decl_ast(src, i);
vec_push(decls, ex.decl);
i = ex.nextPos;
continue;
}
break;
}
const imps = parse_imports_ast(src, i);
let ii = 0;
while (ii < vec_len(imps.decls)) {
vec_push(decls, vec_get(imps.decls, ii));
ii = ii + 1;
}
i = imps.nextPos;
while (true) {
const j = skip_ws(src, i);
if (!starts_with_at(src, j, "module")) {
break;
}
const m = parse_module_decl_ast(src, i);
vec_push(decls, m.decl);
i = m.nextPos;
}
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "type")) {
const td = parse_type_union_decl_ast(src, i, exportAll);
vec_push(decls, td.decl);
i = td.nextPos;
continue;
}
if (starts_with_at(src, j, "struct")) {
const sd = parse_struct_decl_ast(src, i);
vec_push(decls, sd.decl);
i = sd.nextPos;
continue;
}
break;
}
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "let")) {
const start = skip_ws(src, i);
i = parse_keyword(src, i, "let");
const mutOpt = parse_mut_opt(src, i);
i = mutOpt.nextPos;
const name = parse_ident(src, i);
i = name.nextPos;
const t0 = skip_ws(src, i);
if (t0 < stringLen(src) && t0 >= 0) {
}
const colonPos = skip_ws(src, i);
if (starts_with_at(src, colonPos, ":")) {
const _ty = parse_type_expr(src, colonPos + 1);
i = _ty.v1;
}
i = parse_keyword(src, i, "=");
const expr = parse_expr_ast(src, i);
i = expr.nextPos;
i = parse_optional_semicolon(src, i);
vec_push(decls, decl_let(span(start, i), mutOpt.ok, name.text, expr.expr));
continue;
}
break;
}
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "fn")) {
const f = parse_fn_decl_ast2(src, i, exportAll);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "class")) {
const f = parse_class_fn_decl_ast2(src, i, exportAll);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
break;
}
const end = skip_ws(src, i);
if (end < stringLen(src)) {
panic_at(src, end, "unexpected trailing input");
}
const out = vec_new();
vec_push(out, decls);
vec_push(out, end);
return out;
}
export function parse_program_with_trivia(src, exportAll) {
const ts = tokenize_with_trivia(src);
const pack = parse_program_decls_ast(src, exportAll);
const decls = vec_get(pack, 0);
const nextPos = vec_get(pack, 1);
return ParsedProgramWithTrivia(decls, ts, nextPos);
}
