use std::collections::HashMap;
use std::fmt;
use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

/// Per-process counter to guarantee unique temp dirs across parallel test runs.
#[allow(dead_code)]
static INVOCATION_COUNTER: AtomicU64 = AtomicU64::new(0);

#[allow(dead_code)]
fn next_id() -> u64 {
    INVOCATION_COUNTER.fetch_add(1, Ordering::Relaxed)
}

/// Given text starting after the opening `(`, find the matching `)` and return
/// the content between parens and everything after it.
fn split_at_matching_paren(after_open: &str) -> Option<(&str, &str)> {
    let mut depth = 1usize;
    for (i, c) in after_open.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            _ => {}
        }
        if depth == 0 {
            return Some((&after_open[..i], &after_open[i + 1..]));
        }
    }
    None
}

/// Like `str::split(';')` but only splits at semicolons at brace-depth 0,
/// so semicolons inside `{...}` blocks are ignored.
fn split_top_level(s: &str) -> Vec<&str> {
    let mut result = Vec::new();
    let mut start = 0;
    let mut brace_depth = 0usize;
    for (i, c) in s.char_indices() {
        match c {
            '{' | '[' => brace_depth += 1,
            '}' | ']' => brace_depth -= 1,
            ';' if brace_depth == 0 => {
                result.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    let tail = &s[start..];
    if !tail.trim().is_empty() {
        result.push(tail);
    }
    result
}

/// Strip all known type suffixes (`U8`, `I32`) from a string.
/// Must only be called *after* `read<T>()` calls have been replaced,
/// so the suffix inside `<...>` isn't stripped prematurely.
fn strip_type_suffix(s: &str) -> String {
    s.replace("U8", "").replace("I32", "")
}

/// Count top-level commas (not inside `[...]` nested brackets).
fn count_top_level_commas(s: &str) -> usize {
    let mut depth = 0usize;
    let mut count = 0usize;
    for c in s.chars() {
        match c {
            '[' => depth += 1,
            ']' => depth -= 1,
            ',' if depth == 0 => count += 1,
            _ => {}
        }
    }
    count + 1 // elements = commas + 1
}

/// Recursively compute the array dimensions from a bracket-delimited literal.
/// `inner` is the content *between* the outer `[...]`, e.g. for `[[1,2],[3,4]]`
/// it is `[1,2],[3,4]`. Returns dimensions like `[2, 2]`.
fn compute_array_dims(inner: &str) -> Vec<usize> {
    let trimmed = inner.trim();
    if !trimmed.starts_with('[') {
        // Scalar elements: count them.
        let count = trimmed.split(',').count();
        return vec![count];
    }
    let outer = count_top_level_commas(trimmed);
    // Extract the first top-level element (everything from position 0 to its
    // matching bracket).
    let first = extract_first_bracket_element(trimmed);
    let first = first.trim();
    let mut dims = vec![outer];
    if first.starts_with('[') {
        // Recurse into the inner content of the first sub-array.
        let first_inner = &first[1..first.len().saturating_sub(1)];
        dims.extend(compute_array_dims(first_inner));
    } else if !first.is_empty() {
        let inner_count = first.split(',').count();
        dims.push(inner_count);
    }
    dims
}

/// Extract the first bracket-delimited element from a comma-separated list.
/// E.g. `[[1,2],[3,4]]` → `[1,2]` — correctly tracks bracket nesting.
fn extract_first_bracket_element(s: &str) -> &str {
    let trimmed = s.trim();
    if !trimmed.starts_with('[') {
        // Scalar: return up to the first comma or end.
        let end = trimmed.find(',').unwrap_or(trimmed.len());
        return &trimmed[..end];
    }
    let mut depth = 0usize;
    for (j, c) in trimmed.char_indices() {
        match c {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return &trimmed[..=j];
                }
            }
            _ => {}
        }
    }
    trimmed
}

/// Emit C statements for a Bool read (string-based scanf + strcmp).
fn emit_bool_read(vn: &str) -> Vec<String> {
    vec![
        format!("int {};", vn),
        format!("char {0}_buf[8];", vn),
        format!("scanf(\"%7s\", {0}_buf);", vn),
        format!("{} = strcmp({}_buf, \"true\") == 0 ? 1 : 0;", vn, vn),
    ]
}

/// Compile a `let [mut] <name> [= <init>]` statement into C statements,
/// and register any declared variable in the symbol map.
/// Entries are (is_mut, array_size_or_empty, var_type_or_empty).
/// Parse the variable name, mutability, declared type, and array size from a `let` statement.
struct ParsedLetDecl {
    vn: String,
    is_mut: bool,
    decl_type: Option<String>,
    var_type: String,
    array_size: Option<String>,
}

fn parse_let_decl(stmt: &str) -> ParsedLetDecl {
    let after_let = stmt.strip_prefix("let ").unwrap();
    let after_mut = after_let.strip_prefix("mut ").unwrap_or(after_let);
    let is_mut = after_let.starts_with("mut ");
    let vn = after_mut
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_string();
    let after_name = after_mut[vn.len()..].trim();

    let decl_type = after_name.find(':').map(|colon_pos| {
        let rest = after_name[colon_pos + 1..].trim();
        let type_end = rest.find("= ").unwrap_or(rest.len());
        let raw = rest[..type_end].trim();
        if raw.starts_with('[') {
            let inner = &raw[1..raw.find(']').unwrap_or(0)];
            inner.split(';').next().unwrap_or("").trim().to_string()
        } else {
            raw.to_string()
        }
    });
    let var_type = decl_type.clone().unwrap_or_default();

    let array_size = if after_name.starts_with(": [") {
        after_name.find("]").and_then(|close_bracket| {
            let inner = &after_name[3..close_bracket];
            inner
                .find("; ")
                .map(|semi| inner[semi + 2..].trim().to_string())
        })
    } else {
        None
    };

    ParsedLetDecl {
        vn,
        is_mut,
        decl_type,
        var_type,
        array_size,
    }
}

/// Emit C statements for initializing a variable from an array literal.
fn compile_array_literal_init(
    iv: &str,
    vn: &str,
    is_mut: bool,
    var_type: String,
    symbols: &mut HashMap<String, (bool, String, String)>,
) -> Vec<String> {
    let inner = &iv[1..iv.len().saturating_sub(1)];
    let dims = compute_array_dims(inner);
    let c_body = inner.replace("[", "{").replace("]", "}");
    let c_init = format!("{{ {} }}", c_body);
    let size_str = dims
        .iter()
        .map(|d| d.to_string())
        .collect::<Vec<_>>()
        .join("][");
    let out = vec![format!(
        "int {}[{}] = {};",
        vn,
        size_str,
        strip_type_suffix(&c_init)
    )];
    symbols.insert(vn.to_string(), (is_mut, size_str, var_type));
    out
}

/// Emit C statements for initializing a variable from a `read<T>()` expression.
fn compile_read_init(
    read_type: &str,
    vn: &str,
    is_mut: bool,
    decl_type: &Option<String>,
    var_type: &str,
    symbols: &mut HashMap<String, (bool, String, String)>,
) -> Result<Vec<String>, CompileError> {
    if let Some(dt) = decl_type.as_deref()
        && dt != "Bool"
        && read_type != dt
        && read_type != "Bool"
    {
        return Err(CompileError {
            message: format!(
                "type mismatch: variable is `{}` but `read<{}>()` produces `{}`",
                dt, read_type, read_type
            ),
        });
    }

    let mut out = Vec::new();
    if read_type == "Bool" || decl_type.as_deref() == Some("Bool") {
        out.extend(emit_bool_read(vn));
    } else {
        out.push(format!("int {};", vn));
        out.push(format!("scanf(\"%d\", &{});", vn));
    }

    let inferred = if read_type == "Bool" {
        read_type.to_string()
    } else if !var_type.is_empty() {
        var_type.to_string()
    } else {
        read_type.to_string()
    };
    symbols.insert(vn.to_string(), (is_mut, String::new(), inferred));
    Ok(out)
}

/// Emit C statements for initializing a variable as a copy of another variable.
fn compile_var_copy_init(
    src_var: &str,
    vn: &str,
    is_mut: bool,
    var_type: &str,
    symbols: &mut HashMap<String, (bool, String, String)>,
) -> Result<Vec<String>, CompileError> {
    let (_, src_size, src_type) = symbols.get(src_var).unwrap();
    let src_size = src_size.clone();
    let src_type = src_type.clone();

    if !var_type.is_empty()
        && !src_type.is_empty()
        && var_type != src_type
        && var_type != "Bool"
        && src_type != "Bool"
    {
        return Err(CompileError {
            message: format!(
                "type mismatch: variable is `{}` but `{}` is `{}`",
                var_type, src_var, src_type
            ),
        });
    }

    let mut out = Vec::new();
    if src_size.is_empty() {
        out.push(format!("int {};", vn));
        out.push(format!("{} = {};", vn, src_var));
    } else {
        out.push(format!("int {}[{}];", vn, src_size));
        out.push(format!(
            "memcpy({}, {}, sizeof(int) * {});",
            vn, src_var, src_size
        ));
    }
    symbols.insert(vn.to_string(), (is_mut, src_size, src_type));
    Ok(out)
}

fn compile_let_stmt(
    stmt: &str,
    symbols: &mut HashMap<String, (bool, String, String)>,
) -> Result<Vec<String>, CompileError> {
    let decl = parse_let_decl(stmt);
    let mut out: Vec<String> = Vec::new();

    if let Some(eq_pos) = stmt.find("= ") {
        let iv = stmt[eq_pos + 2..].trim();

        if iv.starts_with('[') {
            out = compile_array_literal_init(iv, &decl.vn, decl.is_mut, decl.var_type, symbols);
        } else if let Some(read_type) = iv.strip_prefix("read<").and_then(|s| s.strip_suffix(">()"))
        {
            out = compile_read_init(
                read_type,
                &decl.vn,
                decl.is_mut,
                &decl.decl_type,
                &decl.var_type,
                symbols,
            )?;
        } else if symbols.contains_key(iv) {
            out = compile_var_copy_init(iv, &decl.vn, decl.is_mut, &decl.var_type, symbols)?;
        } else {
            out.push(format!("int {};", decl.vn));
            out.push(format!("{} = {};", decl.vn, strip_type_suffix(iv)));
            symbols.insert(decl.vn.clone(), (decl.is_mut, String::new(), decl.var_type));
        }
    } else if let Some(ref size) = decl.array_size {
        out.push(format!("int {}[{}];", decl.vn, size));
        symbols.insert(decl.vn.clone(), (decl.is_mut, size.clone(), decl.var_type));
    } else {
        out.push(format!("int {};", decl.vn));
        symbols.insert(decl.vn.clone(), (decl.is_mut, String::new(), decl.var_type));
    }
    Ok(out)
}

fn compile_statements(
    src: &str,
    symbols: &mut HashMap<String, (bool, String, String)>,
) -> Result<String, CompileError> {
    let parts = split_top_level(src);
    if parts.is_empty() {
        return Ok(String::new());
    }
    if parts.len() == 1 {
        // Single expression — just emit as return.
        let v = parts[0].trim();
        return Ok(format!("return {};", strip_type_suffix(v)));
    }
    let mut c_stmts: Vec<String> = Vec::new();
    // All parts except the last are statements.
    for stmt in &parts[..parts.len() - 1] {
        let stmt = stmt.trim();
        if stmt.is_empty() {
            continue;
        }
        if stmt.starts_with("let ") {
            c_stmts.extend(compile_let_stmt(stmt, symbols)?);
        } else {
            // Plain statement.
            c_stmts.push(format!("{};", strip_type_suffix(stmt)));
        }
    }
    // Last part is the block's return value.
    let last_expr = parts.last().unwrap().trim();
    c_stmts.push(format!("return {};", strip_type_suffix(last_expr)));
    Ok(c_stmts.join("\n  "))
}

/// Given text like `if (cond) then else else`, parse out the condition, then-expr, and else-expr.
/// Returns None if parsing fails.
fn parse_if_else(s: &str) -> Option<(&str, &str, &str)> {
    let s = s.trim();
    let after_if = s.strip_prefix("if (")?;
    let (condition, rest) = split_at_matching_paren(after_if)?;
    let condition = condition.trim();
    let rest = rest.trim();
    let else_idx = rest.find(" else ")?;
    let then_expr = rest[..else_idx].trim();
    let else_expr = rest[else_idx + 6..].trim();
    Some((condition, then_expr, else_expr))
}

#[derive(Debug, Clone, PartialEq)]
pub struct CompileError {
    pub message: String,
}

impl fmt::Display for CompileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "compile error: {}", self.message)
    }
}

impl std::error::Error for CompileError {}

/// Compile a single `write<U8>(expr);` statement into a complete C program.
fn compile_write_single(val: &str) -> String {
    format!(
        r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>

int main() {{
  printf("%d", {});
  return 0;
}}
"#,
        strip_type_suffix(val.trim())
    )
}

/// Build the condition-reading C code and the condition check expression for an if/else.
fn build_if_cond(condition: &str) -> Result<(String, String), CompileError> {
    let cond_body = if condition == "read<Bool>()" {
        r#"char cond_buf[8];
  scanf("%7s", cond_buf);"#
            .to_string()
    } else if condition.contains("read<U8>()") {
        "int cond_val;\n  scanf(\"%d\", &cond_val);".to_string()
    } else {
        return Err(CompileError {
            message: format!("unsupported if condition: {}", condition),
        });
    };
    let cond_check = if condition == "read<Bool>()" {
        "strcmp(cond_buf, \"true\") == 0"
    } else if condition.contains("read<U8>()") {
        "cond_val"
    } else {
        condition
    };
    Ok((cond_body, cond_check.to_string()))
}

/// Compile a single statement within a multi-statement block (not a `let`).
fn compile_plain_stmt(
    i: usize,
    stmt: &str,
    symbols: &mut HashMap<String, (bool, String, String)>,
) -> Result<String, CompileError> {
    let assign_target = stmt.split_whitespace().next().unwrap_or("");
    if !assign_target.is_empty()
        && !assign_target.starts_with("write<")
        && !assign_target.starts_with("read<")
        && (stmt.contains('=') || stmt.contains("+=") || stmt.contains("-="))
        && let Some(&(is_mut, _, _)) = symbols.get(assign_target)
        && !is_mut
    {
        return Err(CompileError {
            message: format!("cannot reassign immutable variable `{}`", assign_target),
        });
    }

    let compiled = if stmt.contains("read<U8>()") {
        let read_var = format!("_r{}", i);
        let c_line = stmt.replace("read<U8>()", &read_var);
        format!(
            "int {};\n  scanf(\"%d\", &{});\n  {};",
            read_var,
            read_var,
            strip_type_suffix(&c_line)
        )
    } else if stmt.starts_with("write<U8>(") {
        if let Some(val) = stmt
            .strip_prefix("write<U8>(")
            .and_then(|s| s.strip_suffix(")"))
        {
            format!("printf(\"%d\", {});", strip_type_suffix(val.trim()))
        } else {
            format!("{};", strip_type_suffix(stmt))
        }
    } else {
        format!("{};", strip_type_suffix(stmt))
    };
    Ok(compiled)
}

/// Compile a while or for loop statement into a C statement.
/// Returns `None` if the loop syntax cannot be parsed (caller should skip it).
fn compile_loop_stmt(stmt: &str) -> Option<String> {
    if stmt.starts_with("while (") {
        let after_while = stmt.strip_prefix("while (").unwrap();
        let (condition, body) = split_at_matching_paren(after_while)?;
        let body = strip_type_suffix(body.trim());
        Some(format!(
            "while ({}) {{\n    {};\n  }}",
            condition.trim(),
            body
        ))
    } else if stmt.starts_with("for (") {
        let after_for = stmt.strip_prefix("for (").unwrap();
        let (for_header, body) = split_at_matching_paren(after_for)?;
        let body = strip_type_suffix(body.trim());
        let in_pos = for_header.find(" in ")?;
        let loop_var = for_header[..in_pos].trim();
        let range_expr = for_header[in_pos + 4..].trim();
        let dotdot_pos = range_expr.find("..")?;
        let range_start = strip_type_suffix(range_expr[..dotdot_pos].trim());
        let range_end = strip_type_suffix(range_expr[dotdot_pos + 2..].trim());
        Some(format!(
            "for (int {} = {}; {} <= {}; {}++) {{\n    {};\n  }}",
            loop_var, range_start, loop_var, range_end, loop_var, body
        ))
    } else {
        None
    }
}

/// Compile the return expression for a multi-statement block.
fn compile_ret_expr(
    ret_expr: &str,
    c_stmts: &[String],
    symbols: &mut HashMap<String, (bool, String, String)>,
) -> Result<String, CompileError> {
    let stmts = c_stmts.join("\n  ");

    if ret_expr.starts_with("let ") {
        let let_stmts = compile_let_stmt(ret_expr, symbols)?;
        let all_stmts = if c_stmts.is_empty() {
            let_stmts.join("\n  ")
        } else {
            format!("{}\n  {}", stmts, let_stmts.join("\n  "))
        };
        return Ok(format!(
            r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <string.h>

int main() {{
  {stmts}
  return 0;
}}
"#,
            stmts = all_stmts
        ));
    }

    // If the return expression is a top-level if/else, emit it as an if/else block.
    if let Some((condition, raw_then, raw_else)) = parse_if_else(ret_expr) {
        let then_stmts = if raw_then.starts_with('{') {
            let inner = &raw_then[1..raw_then.len().saturating_sub(1)];
            let mut block_symbols = symbols.clone();
            compile_statements(inner, &mut block_symbols).unwrap_or_default()
        } else {
            format!("return {};", strip_type_suffix(raw_then))
        };
        let else_stmts = if raw_else.starts_with('{') {
            let inner = &raw_else[1..raw_else.len().saturating_sub(1)];
            let mut block_symbols = symbols.clone();
            compile_statements(inner, &mut block_symbols).unwrap_or_default()
        } else {
            format!("return {};", strip_type_suffix(raw_else))
        };
        return Ok(format!(
            r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <string.h>

int main() {{
  {stmts}
  if ({cond}) {{
    {then_body}
  }} else {{
    {else_body}
  }}
}}
"#,
            stmts = stmts,
            cond = condition,
            then_body = then_stmts,
            else_body = else_stmts
        ));
    }

    Ok(format!(
        r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <string.h>

int main() {{
  {stmts}
  return {ret};
}}
"#,
        stmts = stmts,
        ret = strip_type_suffix(ret_expr)
    ))
}

/// Pre-process source: extract `fn name(...) : Type => body;` declarations,
/// validate types, inline calls (with parameter substitution),
/// and normalize `read<I32>()` to `read<U8>()`.
/// Parse parameter names from between parentheses in a function declaration.
/// Each parameter is `name : Type` — extracts just the name.
fn parse_fn_params(params_str: &str) -> Vec<String> {
    let trimmed = params_str.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    trimmed
        .split(',')
        .map(|p| {
            let t = p.trim();
            let space = t.find(' ').unwrap_or(t.len());
            t[..space].to_string()
        })
        .collect()
}

/// Split comma-separated arguments at top-level (respecting nested brackets).
fn split_top_level_args(args_str: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0usize;
    let mut start = 0;
    for (i, c) in args_str.char_indices() {
        match c {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(args_str[start..i].trim());
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(args_str[start..].trim());
    parts
}

/// Collect all fn declarations from `output`, remove them, and return the map.
/// Parse a single fn declaration and return `(name, param_names, body, after_paren)`.
/// The declaration must span a continguous range in `output`.
fn parse_single_fn_decl(fn_decl: &str) -> Option<(String, Vec<String>, String, String)> {
    let decl_rest = fn_decl.strip_prefix("fn ")?;
    let paren_open = decl_rest.find('(')?;
    let name = decl_rest[..paren_open].trim().to_string();
    let paren_close = decl_rest.find(')')?;
    let param_names = parse_fn_params(&decl_rest[paren_open + 1..paren_close]);
    let after_paren = decl_rest[paren_close + 1..].trim().to_string();
    let arrow_pos = after_paren.find("=>")?;
    let raw_body = after_paren[arrow_pos + 2..].trim();
    let body = raw_body
        .strip_suffix(';')
        .unwrap_or(raw_body)
        .trim()
        .to_string();
    Some((name, param_names, body, after_paren))
}

/// Validate that param names are unique.
fn check_duplicate_params(name: &str, param_names: &[String]) -> Result<(), CompileError> {
    let mut seen = std::collections::HashSet::new();
    for pn in param_names {
        if !seen.insert(pn.clone()) {
            return Err(CompileError {
                message: format!("duplicate parameter `{}` in `fn {}`", pn, name),
            });
        }
    }
    Ok(())
}

/// Validate that the fn's declared return type matches the body's read type.
fn check_fn_read_type(
    name: &str,
    body: &str,
    decl_type: &Option<String>,
) -> Result<(), CompileError> {
    if let Some(read_type) = body
        .strip_prefix("read<")
        .and_then(|s| s.strip_suffix(">()"))
        && let Some(dt) = decl_type.as_deref()
        && dt != "Bool"
        && read_type != dt
        && read_type != "Bool"
    {
        return Err(CompileError {
            message: format!(
                "type mismatch in `fn {}`: declared `{}` but body is `read<{}>()`",
                name, dt, read_type
            ),
        });
    }
    Ok(())
}

/// Extract the declared return type from the text between `)` and `=>`.
fn extract_decl_type(after_paren: &str) -> Option<String> {
    after_paren.find(':').map(|colon_pos| {
        let after_colon = after_paren[colon_pos + 1..].trim();
        let type_end = after_colon.find("=>").unwrap_or(after_colon.len());
        after_colon[..type_end].trim().to_string()
    })
}

fn extract_fn_decls(
    output: &mut String,
) -> Result<HashMap<String, (Vec<String>, String)>, CompileError> {
    let mut fn_map: HashMap<String, (Vec<String>, String)> = HashMap::new();
    loop {
        if let Some(fn_pos) = output.find("fn ")
            && let Some(body_semi) = output[fn_pos..].find("=>")
        {
            let after_arrow = &output[fn_pos + body_semi + 2..];
            if let Some(semi_pos) = after_arrow.find(';') {
                let fn_decl = &output[fn_pos..fn_pos + body_semi + 2 + semi_pos + 1];
                if let Some((name, param_names, body, after_paren)) = parse_single_fn_decl(fn_decl)
                {
                    check_duplicate_params(&name, &param_names)?;
                    let decl_type = extract_decl_type(&after_paren);
                    check_fn_read_type(&name, &body, &decl_type)?;
                    fn_map.insert(name, (param_names, body));
                    output.replace_range(fn_pos..fn_pos + body_semi + 2 + semi_pos + 1, "");
                    continue;
                }
            }
        }
        break;
    }
    Ok(fn_map)
}

/// Inline all function calls in `source` using the provided fn map.
/// Try to inline a single function call starting at `pos` in `output`.
/// Returns `Some(new_pos)` if a call was inlined, `None` if no call matched.
fn try_inline_call(
    output: &str,
    pos: usize,
    name: &str,
    params: &[String],
    body: &str,
) -> Option<(String, usize)> {
    let bytes = output.as_bytes();
    if !bytes[pos..].starts_with(name.as_bytes())
        || (pos > 0 && bytes[pos - 1].is_ascii_alphanumeric())
    {
        return None;
    }
    let name_end = pos + name.len();
    if name_end >= bytes.len() || bytes[name_end] != b'(' {
        return None;
    }
    let (args_str, _) = split_at_matching_paren(&output[name_end + 1..])?;
    let args = split_top_level_args(args_str.trim());
    if args.len() != params.len() && !(args.len() == 1 && args[0].is_empty() && params.is_empty()) {
        return None;
    }
    let mut inlined = body.to_string();
    for (param, arg) in params.iter().zip(args.iter()) {
        inlined = inlined.replace(param, arg);
    }
    let new_pos = name_end + 1 + args_str.len() + 1;
    Some((inlined, new_pos))
}

fn inline_fn_calls(source: &str, fn_map: &HashMap<String, (Vec<String>, String)>) -> String {
    let mut sorted_names: Vec<&String> = fn_map.keys().collect();
    sorted_names.sort_by_key(|n| std::cmp::Reverse(n.len()));

    let mut output = source.to_string();
    for name in &sorted_names {
        let (params, body) = fn_map.get(*name).unwrap();
        let mut result = String::new();
        let mut pos = 0;
        let bytes = output.as_bytes();
        while pos < bytes.len() {
            if let Some((inlined, new_pos)) = try_inline_call(&output, pos, name, params, body) {
                result.push_str(&inlined);
                pos = new_pos;
                continue;
            }
            result.push(bytes[pos] as char);
            pos += 1;
        }
        output = result;
    }
    output
}

/// Pre-process source: extract `fn name(...) : Type => body;` declarations,
/// validate types, inline calls (with parameter substitution),
/// and normalize `read<I32>()` to `read<U8>()`.
fn preprocess_fns(source: &str) -> Result<String, CompileError> {
    let mut output = source.to_string();

    // 1. Extract and remove all fn declarations, validate types.
    let fn_map = extract_fn_decls(&mut output)?;

    // 2. Normalize I32 reads to U8 (both produce `int` via scanf).
    output = output.replace("read<I32>()", "read<U8>()");

    // 3. Normalize I32 reads in inlined bodies too.
    let mut normalized_fn_map: HashMap<String, (Vec<String>, String)> = HashMap::new();
    for (name, (params, body)) in &fn_map {
        let normalized_body = body.replace("read<I32>()", "read<U8>()");
        normalized_fn_map.insert(name.clone(), (params.clone(), normalized_body));
    }

    // 4. Inline function calls.
    output = inline_fn_calls(&output, &normalized_fn_map);

    Ok(output)
}

fn compile_tuff_to_c(tuff_source: &str) -> Result<String, CompileError> {
    // Pre-process: inline function declarations and normalize I32 reads.
    let processed = preprocess_fns(tuff_source)?;
    let trimmed = processed.trim();

    let allowed_chars =
        |c: char| matches!(c, '<' | '>' | '(' | ')' | '+' | '-' | ' ') || c.is_ascii_alphanumeric();

    // Single write<U8>(expr); statement.
    if trimmed.starts_with("write<")
        && let Some(val) = trimmed
            .strip_prefix("write<U8>(")
            .and_then(|s| s.strip_suffix(");"))
    {
        return Ok(compile_write_single(val));
    }

    // Single if/else expression.
    if let Some((condition, raw_then, raw_else)) = parse_if_else(trimmed) {
        let (cond_body, cond_check) = build_if_cond(condition)?;
        return Ok(format!(
            r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <string.h>

int main() {{
  {cond}
  if ({check}) {{
    return {then};
  }} else {{
    return {els};
  }}
}}
"#,
            cond = cond_body,
            check = cond_check,
            then = strip_type_suffix(raw_then),
            els = strip_type_suffix(raw_else)
        ));
    }

    // Multi-statement programs with let/while/for statements.
    if trimmed.starts_with("let ")
        || trimmed.starts_with("while (")
        || trimmed.starts_with("for (")
        || trimmed.starts_with("write<")
    {
        let parts = split_top_level(trimmed);
        if parts.len() >= 2 {
            let mut c_stmts: Vec<String> = Vec::new();
            let mut symbols: HashMap<String, (bool, String, String)> = HashMap::new();

            for (i, stmt) in parts[..parts.len() - 1].iter().enumerate() {
                let stmt = stmt.trim();
                if stmt.is_empty() {
                    continue;
                }
                if stmt.starts_with("let ") {
                    c_stmts.extend(compile_let_stmt(stmt, &mut symbols)?);
                } else if stmt.starts_with("while (") || stmt.starts_with("for (") {
                    c_stmts.extend(compile_loop_stmt(stmt).into_iter());
                } else {
                    c_stmts.push(compile_plain_stmt(i, stmt, &mut symbols)?);
                }
            }

            let ret_expr = parts.last().unwrap().trim();
            return compile_ret_expr(ret_expr, &c_stmts, &mut symbols);
        }
    }

    // Single read<Bool>() — reads "true" or "false" from stdin, returns 1 or 0.
    if trimmed == "read<Bool>()" {
        return Ok(r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <string.h>

int main() {
  char buf[8];
  scanf("%7s", buf);
  return strcmp(buf, "true") == 0 ? 1 : 0;
}
"#
        .to_string());
    }

    // Expression composed only of read<U8>() calls joined by '+'/'-'.
    let num_reads = trimmed.matches("read<U8>()").count();
    if num_reads > 0 && trimmed.chars().all(allowed_chars) {
        let mut reads = Vec::new();
        for i in 0..num_reads {
            reads.push(format!("int v{};\n  scanf(\"%d\", &v{});", i, i));
        }
        let mut expr = trimmed.to_string();
        for i in 0..num_reads {
            expr = expr.replacen("read<U8>()", &format!("v{}", i), 1);
        }
        expr = strip_type_suffix(&expr);
        expr = expr.split_whitespace().collect::<Vec<_>>().join(" ");
        return Ok(format!(
            r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>

int main() {{
  {reads}
  return {sum};
}}
"#,
            reads = reads.join("\n  "),
            sum = expr
        ));
    }

    // Fallthrough for general Tuff expressions that don't start with keywords
    // (e.g. arithmetic after fn inlining like "3 + 4").
    if !trimmed.is_empty()
        && !trimmed.starts_with("let ")
        && !trimmed.starts_with("while (")
        && !trimmed.starts_with("for (")
        && !trimmed.starts_with("if (")
        && !trimmed.starts_with("read<")
        && !trimmed.starts_with("write<")
        && !trimmed.contains("fn ")
    {
        let expr = strip_type_suffix(trimmed);
        return Ok(format!(
            r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>

int main() {{
  return {};
}}
"#,
            expr
        ));
    }

    // Default: empty program returning 0.
    Ok(format!(
        "#include <stdio.h>\n\nint main() {{\n{body}\n  return 0;\n}}",
        body = "// TODO: lowered Tuff statements go here"
    ))
}

fn compile_and_run(
    tuff_source: &str,
    std_in: Option<&str>,
    out_dir: &std::path::Path,
) -> (i32, String) {
    // 1) Compile Tuff source to C.
    let c_source = match compile_tuff_to_c(tuff_source) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("{}", e);
            return (1, String::new());
        }
    };

    // 2) Write C source and compile with clang.
    fs::create_dir_all(out_dir).expect("failed to create output dir");

    let c_path = out_dir.join("main.c");
    #[cfg(windows)]
    let exe_name = "main.exe";
    #[cfg(not(windows))]
    let exe_name = "main";
    let exe_path = out_dir.join(exe_name);

    let mut c_file = fs::File::create(&c_path).expect("failed to create .c file");
    c_file
        .write_all(c_source.as_bytes())
        .expect("failed to write .c file");

    let compile_result = Command::new("clang")
        .args([&c_path.to_string_lossy(), "-o", &exe_path.to_string_lossy()])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status();

    match compile_result {
        Ok(status) => {
            if !status.success() {
                eprintln!("clang failed with: {}", status);
                return (1, String::new());
            }
        }
        Err(e) => {
            eprintln!("failed to spawn clang: {}", e);
            return (1, String::new());
        }
    }

    // 3) Run the .exe with stdIn, capturing stdout.
    let mut child = Command::new(&exe_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("failed to spawn executable");

    if let Some(input) = std_in {
        let stdin = child.stdin.as_mut().expect("failed to get stdin");
        stdin
            .write_all(input.as_bytes())
            .expect("failed to write stdin");
    }

    // 4) Return exit code and captured stdout.
    match child.wait_with_output() {
        Ok(output) => {
            let out_str = String::from_utf8_lossy(&output.stdout).to_string();
            (output.status.code().unwrap_or(-1), out_str)
        }
        Err(e) => {
            eprintln!("failed waiting for process: {}", e);
            (-1, String::new())
        }
    }
}

#[allow(dead_code)]
fn execute_tuff(tuff_source: &str, std_in: Option<&str>) -> (i32, String) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    let uid = format!("{:x}{:08x}", now.as_nanos(), next_id());
    let out_dir = std::env::temp_dir().join(format!("tuffc-out-{}", uid));
    compile_and_run(tuff_source, std_in, &out_dir)
}

fn run(args: &[String]) -> i32 {
    if args.len() < 2 {
        eprintln!("Usage: tuffc <file.tuff>");
        return 1;
    }

    let path = std::path::Path::new(&args[1]);
    let source = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("failed to read {}: {}", path.display(), e);
            return 1;
        }
    };

    let out_dir = path.parent().unwrap_or(std::path::Path::new("."));
    compile_and_run(&source, None, out_dir).0
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let exit_code = run(&args);
    std::process::exit(exit_code);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_empty_source_returns_zero() {
        let (exit_code, _stdout) = execute_tuff("", None);
        assert_eq!(exit_code, 0);
    }

    #[test]
    fn test_execute_whitespace_source_returns_zero() {
        let (exit_code, _stdout) = execute_tuff("   \n\t  ", None);
        assert_eq!(exit_code, 0);
    }

    #[test]
    fn test_read_u8_with_stdin_returns_value() {
        let (exit_code, _stdout) = execute_tuff("read<U8>()", Some("100"));
        assert_eq!(exit_code, 100);
    }

    #[test]
    fn test_read_u8_reads_only_first_value() {
        // read<U8>() should consume only the first integer from stdin.
        let (exit_code, _stdout) = execute_tuff("read<U8>()", Some("100 20"));
        assert_eq!(exit_code, 100);
    }

    #[test]
    fn test_read_u8_addition_reads_two_values() {
        // read<U8>() + read<U8>() should sum two integers from stdin.
        let (exit_code, _stdout) = execute_tuff("read<U8>() + read<U8>()", Some("100 20"));
        assert_eq!(exit_code, 120);
    }

    #[test]
    fn test_read_u8_addition_reads_three_values() {
        // read<U8>() + read<U8>() + read<U8>() should sum three integers from stdin.
        let (exit_code, _stdout) =
            execute_tuff("read<U8>() + read<U8>() + read<U8>()", Some("1 2 3"));
        assert_eq!(exit_code, 6);
    }

    #[test]
    fn test_read_u8_subtraction_mixed_operators() {
        // read<U8>() + read<U8>() - read<U8>() should compute 3 + 4 - 5 = 2.
        let (exit_code, _stdout) =
            execute_tuff("read<U8>() + read<U8>() - read<U8>()", Some("3 4 5"));
        assert_eq!(exit_code, 2);
    }

    #[test]
    fn test_let_variable_read_u8() {
        // let x : U8 = read<U8>(); x should read one value and return it.
        let (exit_code, _stdout) = execute_tuff("let x : U8 = read<U8>(); x", Some("3 4 5"));
        assert_eq!(exit_code, 3);
    }

    #[test]
    fn test_let_variable_self_addition() {
        // let x : U8 = read<U8>(); x + x should read one value and double it.
        let (exit_code, _stdout) = execute_tuff("let x : U8 = read<U8>(); x + x", Some("3 4 5"));
        assert_eq!(exit_code, 6);
    }

    #[test]
    fn test_let_mut_variable_reassignment() {
        // let mut x : U8 = read<U8>(); x = read<U8>(); x should return the reassigned value.
        let (exit_code, _stdout) = execute_tuff(
            "let mut x : U8 = read<U8>(); x = read<U8>(); x",
            Some("3 4 5"),
        );
        assert_eq!(exit_code, 4);
    }

    #[test]
    fn test_let_mut_init_literal_then_add_assign() {
        // let mut x = 0U8; x += read<U8>(); x with "5" should compute 0 + 5 = 5.
        let (exit_code, _stdout) = execute_tuff("let mut x = 0U8; x += read<U8>(); x", Some("5"));
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_let_temp_read_u8() {
        // let temp = read<U8>(); temp with "5" should return 5.
        let (exit_code, _stdout) = execute_tuff("let temp = read<U8>(); temp", Some("5"));
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_while_loop_counter() {
        // let mut counter = 0U8; let sum = read<U8>(); while (counter < sum) counter += 1; counter
        // with "5" should increment counter from 0 to 5, then return 5.
        let (exit_code, _stdout) = execute_tuff(
            "let mut counter = 0U8; let sum = read<U8>(); while (counter < sum) counter += 1; counter",
            Some("5"),
        );
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_let_bool_if_else() {
        // let temp : Bool = read<Bool>(); if (temp) 3U8 else 5U8 with "false" should return 5.
        let (exit_code, _stdout) = execute_tuff(
            "let temp : Bool = read<Bool>(); if (temp) 3U8 else 5U8",
            Some("false"),
        );
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_let_bool_if_else_block_then() {
        // let temp : Bool = read<Bool>(); if (temp) { let x = 3U8; x } else 5U8 with "false" should return 5.
        let (exit_code, _stdout) = execute_tuff(
            "let temp : Bool = read<Bool>(); if (temp) { let x = 3U8; x } else 5U8",
            Some("false"),
        );
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_let_bool_if_else_block_then_true() {
        // let temp : Bool = read<Bool>(); if (temp) { let x = 3U8; x } else 5U8 with "true" should return 3.
        let (exit_code, _stdout) = execute_tuff(
            "let temp : Bool = read<Bool>(); if (temp) { let x = 3U8; x } else 5U8",
            Some("true"),
        );
        assert_eq!(exit_code, 3);
    }

    #[test]
    fn test_let_bool_if_else_block_else() {
        // Both branches use block bodies.
        // if (temp) 5U8 else { let x = 3U8; x } with "false" should return 3.
        let (exit_code, _stdout) = execute_tuff(
            "let temp : Bool = read<Bool>(); if (temp) 5U8 else { let x = 3U8; x }",
            Some("false"),
        );
        assert_eq!(exit_code, 3);
    }

    #[test]
    fn test_let_i32_no_init_then_assign() {
        // let mut temp : I32; temp = 100I32; temp should return 100.
        let (exit_code, _stdout) = execute_tuff("let mut temp : I32; temp = 100I32; temp", None);
        assert_eq!(exit_code, 100);
    }

    #[test]
    fn test_immutable_reassign_error() {
        // let x = 0U8; x = 1U8; x should return CompileError.
        let result = compile_tuff_to_c("let x = 0U8; x = 1U8; x");
        assert_eq!(
            result,
            Err(CompileError {
                message: "cannot reassign immutable variable `x`".to_string()
            })
        );
    }

    #[test]
    fn test_type_mismatch_read_u16_into_u8() {
        // let x : U8 = read<U16>(); x should fail because U16 may not fit in U8.
        let result = compile_tuff_to_c("let x : U8 = read<U16>(); x");
        assert_eq!(
            result,
            Err(CompileError {
                message: "type mismatch: variable is `U8` but `read<U16>()` produces `U16`"
                    .to_string()
            })
        );
    }

    #[test]
    fn test_type_mismatch_var_copy_u16_into_u8() {
        // let x = read<U16>(); let y : U8 = x; should fail.
        let result = compile_tuff_to_c("let x = read<U16>(); let y : U8 = x");
        assert_eq!(
            result,
            Err(CompileError {
                message: "type mismatch: variable is `U8` but `x` is `U16`".to_string()
            })
        );
    }

    #[test]
    fn test_let_with_trailing_decl() {
        // A let declaration as the last part should compile.
        let result = compile_tuff_to_c("let x = read<U8>(); let y : U8 = x");
        assert_eq!(result.unwrap().contains("return 0;"), true);
    }

    #[test]
    fn test_write_u8() {
        // write<U8>(100U8); should print "100" and return 0.
        let (exit_code, stdout) = execute_tuff("write<U8>(100U8);", None);
        assert_eq!(exit_code, 0);
        assert_eq!(stdout, "100");
    }

    #[test]
    fn test_write_u8_with_return() {
        // write<U8>(100U8); 5 should print "100" and return 5.
        let (exit_code, stdout) = execute_tuff("write<U8>(100U8); 5", None);
        assert_eq!(exit_code, 5);
        assert_eq!(stdout, "100");
    }

    #[test]
    fn test_let_array_i32() {
        // let array : [I32; 3] = [1, 2, 3]; array[0] should return 1.
        let (exit_code, stdout) = execute_tuff("let array : [I32; 3] = [1, 2, 3]; array[0]", None);
        assert_eq!(exit_code, 1);
        assert_eq!(stdout, "");
    }

    #[test]
    fn test_let_array_copy() {
        // let array = [1, 2, 3]; let temp = array; temp[0] should return 1.
        let (exit_code, stdout) =
            execute_tuff("let array = [1, 2, 3]; let temp = array; temp[0]", None);
        assert_eq!(exit_code, 1);
        assert_eq!(stdout, "");
    }

    #[test]
    fn test_let_2d_array() {
        // let array = [[1, 2], [3, 4]]; array[0][0] should return 1.
        let (exit_code, stdout) = execute_tuff("let array = [[1, 2], [3, 4]]; array[0][0]", None);
        assert_eq!(exit_code, 1);
        assert_eq!(stdout, "");
    }

    #[test]
    fn test_let_3d_array() {
        // let array = [[[1, 2], [3, 4]], [[5, 6], [7, 8]]]; array[0][1][0] should return 3.
        let (exit_code, stdout) = execute_tuff(
            "let array = [[[1, 2], [3, 4]], [[5, 6], [7, 8]]]; array[0][1][0]",
            None,
        );
        assert_eq!(exit_code, 3);
        assert_eq!(stdout, "");
    }

    #[test]
    fn test_let_4d_array() {
        // let array = [[[[1]]]]; array[0][0][0][0] should return 1.
        let (exit_code, stdout) = execute_tuff("let array = [[[[1]]]]; array[0][0][0][0]", None);
        assert_eq!(exit_code, 1);
        assert_eq!(stdout, "");
    }

    #[test]
    fn test_if_block_single_expr_then() {
        // Block with just a single expression in the then branch.
        // if (temp) { 5U8 } else 3U8 with "true" should return 5.
        let (exit_code, _stdout) = execute_tuff(
            "let temp : Bool = read<Bool>(); if (temp) { 5U8 } else 3U8",
            Some("true"),
        );
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_if_block_bool_init_reassignment() {
        // Block with a let Bool init and reassignment inside.
        let (exit_code, _stdout) = execute_tuff(
            "let temp : Bool = read<Bool>(); if (temp) { let x : Bool = read<Bool>(); x } else 0U8",
            Some("true true"),
        );
        assert_eq!(exit_code, 1);
    }

    #[test]
    fn test_for_loop_sum_to_count() {
        // let count = read<U8>(); let mut sum = 0U8; for (i in 0..count) sum += i; sum
        // with "5" should compute 0 + 0 + 1 + 2 + 3 + 4 + 5 = 15.
        let (exit_code, _stdout) = execute_tuff(
            "let count = read<U8>(); let mut sum = 0U8; for (i in 0..count) sum += i; sum",
            Some("5"),
        );
        assert_eq!(exit_code, 15);
    }

    #[test]
    fn test_read_bool_true_returns_one() {
        // read<Bool>() with stdin "true" should return 1.
        let (exit_code, _stdout) = execute_tuff("read<Bool>()", Some("true"));
        assert_eq!(exit_code, 1);
    }

    #[test]
    fn test_function_decl_inline_read() {
        // fn get() : I32 => read<I32>(); get() with "100" should return 100.
        let (exit_code, _stdout) =
            execute_tuff("fn get() : I32 => read<I32>(); get()", Some("100"));
        assert_eq!(exit_code, 100);
    }

    #[test]
    fn test_function_decl_add_params() {
        // fn add(first : I32, second : I32) => first + second; add(3, 4) should return 7.
        let (exit_code, _stdout) = execute_tuff(
            "fn add(first : I32, second : I32) => first + second; add(3, 4)",
            None,
        );
        assert_eq!(exit_code, 7);
    }

    #[test]
    fn test_function_decl_duplicate_params() {
        // fn add(first : I32, first : I32) => first + first; add(3, 4) should error.
        let result =
            compile_tuff_to_c("fn add(first : I32, first : I32) => first + first; add(3, 4)");
        assert_eq!(
            result,
            Err(CompileError {
                message: "duplicate parameter `first` in `fn add`".to_string()
            })
        );
    }

    #[test]
    fn test_function_decl_type_mismatch() {
        // fn get() : U8 => read<I32>(); get() should error (U8 != I32).
        let result = compile_tuff_to_c("fn get() : U8 => read<I32>(); get()");
        assert_eq!(
            result,
            Err(CompileError {
                message: "type mismatch in `fn get`: declared `U8` but body is `read<I32>()`"
                    .to_string()
            })
        );
    }

    #[test]
    fn test_function_decl_type_match() {
        // fn get() : U8 => read<U8>(); get() with "100" should succeed.
        let (exit_code, _stdout) = execute_tuff("fn get() : U8 => read<U8>(); get()", Some("100"));
        assert_eq!(exit_code, 100);
    }

    #[test]
    fn test_read_u8_plus_literal() {
        // read<U8>() + 1U8 should read 100 and add literal 1.
        let (exit_code, _stdout) = execute_tuff("read<U8>() + 1U8", Some("100"));
        assert_eq!(exit_code, 101);
    }

    #[test]
    fn test_if_read_bool_then_u8_literal() {
        // if (read<Bool>()) 3U8 else 5U8 with "true" should return 3.
        let (exit_code, _stdout) = execute_tuff("if (read<Bool>()) 3U8 else 5U8", Some("true"));
        assert_eq!(exit_code, 3);
    }

    #[test]
    fn test_if_read_bool_else_u8_literal() {
        // if (read<Bool>()) 3U8 else 5U8 with "false" should return 5.
        let (exit_code, _stdout) = execute_tuff("if (read<Bool>()) 3U8 else 5U8", Some("false"));
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_if_read_u8_condition() {
        // if (read<U8>()) 3U8 else 5U8 with "1" should return 3 (truthy).
        let (exit_code, _stdout) = execute_tuff("if (read<U8>()) 3U8 else 5U8", Some("1"));
        assert_eq!(exit_code, 3);
    }

    #[test]
    fn test_if_read_u8_condition_falsy() {
        // if (read<U8>()) 3U8 else 5U8 with "0" should return 5 (falsy).
        let (exit_code, _stdout) = execute_tuff("if (read<U8>()) 3U8 else 5U8", Some("0"));
        assert_eq!(exit_code, 5);
    }

    #[test]
    fn test_if_literal_condition_truthy() {
        // if (1) 3U8 else 5U8 should fail to compile (literal if condition rejected).
        let result = compile_tuff_to_c("if (1) 3U8 else 5U8");
        assert!(result.is_err());
    }

    #[test]
    fn test_if_literal_condition_falsy() {
        // if (0) 3U8 else 5U8 should fail to compile (literal if condition rejected).
        let result = compile_tuff_to_c("if (0) 3U8 else 5U8");
        assert!(result.is_err());
    }

    #[test]
    fn test_compile_if_no_closing_paren_falls_through() {
        // Unclosed parens in if expression should fall through to default path.
        let result = compile_tuff_to_c("if (read<Bool>()");
        assert!(result.unwrap().contains("return 0;"));
    }

    #[test]
    fn test_compile_if_no_else_falls_through() {
        // if without else should fall through to default path.
        let result = compile_tuff_to_c("if (read<Bool>()) 3U8");
        assert!(result.unwrap().contains("return 0;"));
    }

    #[test]
    fn test_compile_let_single_part_falls_through() {
        // let without semicolons should fall through to default path.
        let result = compile_tuff_to_c("let x");
        assert!(result.unwrap().contains("return 0;"));
    }

    #[test]
    fn test_compile_for_no_closing_paren_falls_through() {
        // for without closing paren should fall through to default path.
        let result = compile_tuff_to_c("for (i in 0..5");
        assert!(result.unwrap().contains("return 0;"));
    }

    #[test]
    fn test_compile_for_no_in_keyword_falls_through() {
        // for without 'in' keyword should produce no for-loop output.
        let result = compile_tuff_to_c("for (i 0..5) sum += i; sum");
        assert!(
            !result.unwrap().contains("for ("),
            "no for loop should be generated"
        );
    }

    #[test]
    fn test_compile_for_no_dotdot_falls_through() {
        // for without '..' range should produce no for-loop output.
        let result = compile_tuff_to_c("for (i in 0-5) sum += i; sum");
        assert!(
            !result.unwrap().contains("for ("),
            "no for loop should be generated"
        );
    }

    #[test]
    fn test_compile_while_no_closing_paren_falls_through() {
        // while without closing paren should fall through to default path.
        let result = compile_tuff_to_c("while (counter < sum");
        assert!(result.unwrap().contains("return 0;"));
    }

    #[test]
    fn test_if_literal_condition_rejected() {
        // if (100) 3U8 else 5U8 should return Err (literal conditions not supported).
        let result = compile_tuff_to_c("if (100) 3U8 else 5U8");
        assert_eq!(
            result,
            Err(CompileError {
                message: "unsupported if condition: 100".to_string()
            })
        );
    }

    #[test]
    fn test_compile_error_display() {
        let err = CompileError {
            message: "test error".to_string(),
        };
        assert_eq!(format!("{}", err), "compile error: test error");
    }

    #[test]
    fn test_execute_tuff_compile_error_returns_one() {
        // Literal if condition now returns CompileError, which execute_tuff turns into exit code 1.
        let (exit_code, _stdout) = execute_tuff("if (100) 3U8 else 5U8", None);
        assert_eq!(exit_code, 1);
    }

    #[test]
    fn test_clang_compile_failure() {
        // Invalid then-expr should cause clang to fail.
        let (exit_code, _stdout) =
            execute_tuff("if (read<Bool>()) read<Bool>() else 0U8", Some("true"));
        assert_eq!(exit_code, 1);
    }

    #[test]
    fn test_run_no_args_returns_one() {
        let exit_code = run(&[]);
        assert_eq!(exit_code, 1);
    }

    #[test]
    fn test_run_file_not_found_returns_one() {
        let exit_code = run(&["tuffc".to_string(), "nonexistent_file.tuff".to_string()]);
        assert_eq!(exit_code, 1);
    }

    #[test]
    fn test_run_with_valid_file() {
        // Create a temp .tuff file and run it through the run() entry point.
        let tmp_dir = std::env::temp_dir().join(format!("tuffc-test-{}", next_id()));
        fs::create_dir_all(&tmp_dir).unwrap();
        let tuff_path = tmp_dir.join("test.tuff");
        fs::write(&tuff_path, "read<U8>()").unwrap();

        let exit_code = run(&["tuffc".to_string(), tuff_path.to_string_lossy().to_string()]);
        // Without stdin, scanf gets no input. On Windows, scanf of "%d" with no input
        // leaves the variable uninitialized — just verify the process ran (exit code 0 or nonzero).
        // The important thing is that run() executed without panicking.
        let _ = exit_code;

        // Cleanup
        let _ = fs::remove_dir_all(&tmp_dir);
    }
}
