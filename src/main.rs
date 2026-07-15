use core::panic;
use std::collections::HashSet;
use std::io::Write;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};

type CompileError = String;

/// Shared compilation context passed between compiler functions.
struct CompileContext {
    vars: Vec<String>,
    var_idx: usize,
    mutable_vars: Vec<String>,
    declared_vars: HashSet<String>,
    generated_functions: Vec<(String, Vec<String>, String)>, // (name, param_names, c_code)
}

/// Tracks read calls in source order with their types for correct C code generation.
#[allow(dead_code)]
struct ReadTracker {
    reads: Vec<(usize, ReadType)>,
}

impl ReadTracker {
    #[allow(dead_code)]
    fn track(&mut self, pos: usize, read_type: ReadType) {
        self.reads.push((pos, read_type));
    }
}

#[derive(Clone)]
enum ReadType {
    Int,
    Bool,
}

static TEMP_COUNTER: AtomicU32 = AtomicU32::new(0);

/// Strip fn bodies from source for top-level read tracking.
/// Replaces "fn name(...) => body;" with empty string so reads inside fn aren't counted at main level.
fn strip_fn_bodies(source: &str) -> String {
    let mut result = String::new();
    let mut i = 0;

    while i < source.len() {
        if source[i..].starts_with("fn ")
            && (i == 0 || !source[..i].chars().last().unwrap_or(' ').is_alphanumeric())
        {
            // Skip past "fn name" to the opening paren
            let start = i;
            i += 3; // skip "fn "
            // Find '('
            while i < source.len() && source.as_bytes()[i] != b'(' {
                i += 1;
            }
            if i < source.len() {
                // Skip to matching ')'
                let paren_end = find_matching_paren(&source[i..]);
                if let Some(end) = paren_end {
                    i = i + end + 1;
                    // Skip past optional return type annotation (e.g., ": I32") and find "=>"
                    while i < source.len() && !source[i..].starts_with("=>") {
                        i += 1;
                    }
                    if source[i..].starts_with("=>") {
                        i += 2; // skip "=>"
                    }
                    // Now find the semicolon that ends this fn definition (at top level)
                    let semi_pos = find_top_level_semicolon(&source[i..]);
                    if let Some(s) = semi_pos {
                        i = i + s + 1;
                    } else {
                        result.push_str(&source[start..]);
                        break;
                    }
                } else {
                    // No matching paren, just copy from start
                    result.push(source.as_bytes()[start] as char);
                    i = start + 1;
                }
            } else {
                result.push_str(&source[start..]);
            }
        } else {
            let ch_len = source[i..].chars().next().unwrap_or('\0').len_utf8();
            result.push(source[i..i + ch_len].chars().next().unwrap());
            i += ch_len;
        }
    }

    result
}

fn main() {
    println!("Hello, world!");
}

/// Find all read calls in source order and classify them by type.
fn find_reads_in_order(source: &str) -> Vec<(usize, ReadType)> {
    let mut reads = Vec::new();
    let mut i = 0;
    while i < source.len() {
        if source[i..].starts_with("read<Bool>()") {
            reads.push((i, ReadType::Bool));
            i += "read<Bool>()".len();
        } else if source[i..].starts_with("read()") {
            reads.push((i, ReadType::Int));
            i += "read()".len();
        } else {
            i += 1;
        }
    }
    reads
}

fn compile(source: &str) -> Result<String, CompileError> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Ok(String::from("int main() {\n\treturn 0;\n}\n"));
    }

    // Strip fn bodies from source before scanning for top-level reads.
    let stripped_for_reads = strip_fn_bodies(trimmed);

    // Find all reads in source order and assign variables sequentially.
    let read_entries = find_reads_in_order(&stripped_for_reads);
    let read_count = read_entries.len();
    let vars: Vec<String> = (0..read_count).map(|i| format!("v{}", i)).collect();

    // Parse let declarations and build C body
    let mut ctx = CompileContext {
        vars: vars.clone(),
        var_idx: 0,
        mutable_vars: Vec::new(),
        declared_vars: HashSet::new(),
        generated_functions: Vec::new(),
    };
    let (c_body, return_expr) = compile_expression(trimmed, &mut ctx)?;

    if read_count > 0 {
        // Generate C code for reads in source order.
        let mut c_decls = String::new();
        let mut c_reads = String::new();

        for (i, (_pos, entry_type)) in read_entries.iter().enumerate() {
            let var_name = &vars[i];
            match entry_type {
                ReadType::Int => {
                    c_decls.push_str(&format!("\tint {};\n", var_name));
                    c_reads.push_str(&format!("\tscanf(\"%d\", &{});\n", var_name));
                }
                ReadType::Bool => {
                    c_decls.push_str(&format!("\tint {};\n", var_name));
                    // Use scanf("%s") to read a single whitespace-delimited token, then compare.
                    c_reads.push_str(&format!(
                        "\tscanf(\"%63s\", buf);\n{} = strcmp(buf, \"true\") == 0 || buf[0] == '1';\n",
                        var_name
                    ));
                }
            }
        }

        // Build final C program with stdbool.h for boolean support
        let has_bool_reads = read_entries
            .iter()
            .any(|(_, t)| matches!(t, ReadType::Bool));
        let includes = if has_bool_reads {
            "#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>"
        } else {
            "#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>"
        };
        let buf_decl = if has_bool_reads {
            "\tchar buf[64];"
        } else {
            ""
        };

        let (c_prototypes, c_functions) = generate_function_code(&ctx.generated_functions);

        Ok(format!(
            "{}\n{}\n{}int main() {{\n{}\n{}\n\t{}\n\t{}\n\treturn {};\n}}\n",
            includes,
            c_prototypes.trim(),
            c_functions.trim(),
            buf_decl,
            c_decls.trim(),
            c_reads.trim(),
            c_body,
            return_expr
        ))
    } else {
        let (c_prototypes, c_functions) = generate_function_code(&ctx.generated_functions);

        // Include stdio.h if any generated functions use scanf (have local reads)
        let includes = if !c_functions.is_empty() {
            "#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>"
        } else {
            ""
        };

        Ok(format!(
            "{}\n{}\n{}int main() {{\n\t{}\n\treturn {};\n}}\n",
            includes,
            c_prototypes.trim(),
            c_functions.trim(),
            c_body,
            return_expr
        ))
    }
}

/// Generate C function prototypes and definitions from compiled functions.
fn generate_function_code(functions: &[(String, Vec<String>, String)]) -> (String, String) {
    let mut c_prototypes = String::new();
    for (name, params, _func_code) in functions {
        if params.is_empty() {
            c_prototypes.push_str(&format!("int {}(void);\n", name));
        } else {
            let param_sig: Vec<String> = params.iter().map(|p| format!("int {}", p)).collect();
            c_prototypes.push_str(&format!("int {}({});\n", name, param_sig.join(", ")));
        }
    }

    let mut c_functions = String::new();
    for (_name, _params, func_code) in functions {
        c_functions.push_str(func_code);
        c_functions.push('\n');
    }

    (c_prototypes, c_functions)
}

/// Parse a let declaration, extracting the variable name, mutability, and optional type annotation.
fn parse_let_declaration(decl: &str) -> (&str, bool, Option<String>) {
    // Find '=' position (top-level, not inside brackets)
    let eq_pos = find_top_level_char(decl, '=');
    let before_eq = if let Some(pos) = eq_pos {
        &decl[..pos]
    } else {
        decl
    };

    // Strip "mut " prefix if present
    let after_mut = if let Some(stripped) = before_eq.strip_prefix("mut ") {
        (stripped, true)
    } else {
        (before_eq, false)
    };

    // Check for type annotation: "x : Type"
    if let Some(colon_pos) = after_mut.0.find(':') {
        let var_name = after_mut.0[..colon_pos].trim();
        let type_name = after_mut.0[colon_pos + 1..].trim();
        (var_name, after_mut.1, Some(type_name.to_string()))
    } else {
        let var_name = after_mut.0.split_whitespace().next().unwrap_or("x");
        (var_name, after_mut.1, None)
    }
}

/// Parse the expected size from an array type annotation like "[I32; 1]" or "[u8; 4]".
fn parse_array_size(ty: &str) -> Option<usize> {
    let trimmed = ty.trim();
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return None;
    }
    let inner = &trimmed[1..trimmed.len() - 1];
    if let Some(semi_pos) = inner.find(';') {
        let size_part = inner[semi_pos + 1..].trim();
        size_part.parse().ok()
    } else {
        None
    }
}

/// Find the index of a character at the top level (not inside any braces or brackets).
fn find_top_level_char(s: &str, target: char) -> Option<usize> {
    let mut brace_depth = 0;
    let mut bracket_depth = 0;
    for (i, ch) in s.chars().enumerate() {
        match ch {
            '{' => brace_depth += 1,
            '}' => brace_depth -= 1,
            '[' => bracket_depth += 1,
            ']' => bracket_depth -= 1,
            c if brace_depth == 0 && bracket_depth == 0 && c == target => return Some(i),
            _ => {}
        }
    }
    None
}

/// Parse array repeat syntax [value; count], returning (value_str, count) if it matches.
fn parse_array_repeat(s: &str) -> Option<(&str, usize)> {
    let closing_bracket = find_matching_bracket(s)?;
    let inner = &s[1..closing_bracket];
    // Must have exactly one ';' at top level
    let semi_pos = find_top_level_char(inner, ';')?;
    let value_part = inner[..semi_pos].trim();
    let count_part = inner[semi_pos + 1..].trim();
    let count = count_part.parse().ok()?;
    Some((value_part, count))
}

/// Parse the contents of an array literal, returning the items and the closing bracket position.
fn parse_array_items(s: &str) -> Option<(Vec<&str>, usize)> {
    let closing_bracket = find_matching_bracket(s)?;
    let array_content = &s[1..closing_bracket];
    let items: Vec<&str> = if array_content.trim().is_empty() {
        vec![]
    } else {
        array_content.split(',').map(|item| item.trim()).collect()
    };
    Some((items, closing_bracket))
}

/// Recursively compile an array declaration, handling nested arrays.
/// Returns (C declaration statement, return expression for final part).
fn compile_array_decl(
    var_name: &str,
    array_expr: &str,
    final_part: &str,
    ctx: &mut CompileContext,
) -> Result<(String, String), CompileError> {
    let trimmed = array_expr.trim();
    debug_assert!(trimmed.starts_with('['));

    // Check for array repeat syntax: [value; count]
    if let Some((repeat_value, repeat_count)) = parse_array_repeat(trimmed) {
        let (val_body, val_result) = compile_expression(repeat_value, ctx)?;
        let repeated: Vec<_> = (0..repeat_count).map(|_| val_result.clone()).collect();
        let init = format!("{{{}}}", repeated.join(", "));
        let c_decl = format!(
            "{}\n\tint {}[{}] = {};",
            val_body, var_name, repeat_count, init
        );
        let (final_body, final_result) = compile_expression(final_part, ctx)?;
        return Ok((format!("{}\n{}", c_decl, final_body), final_result));
    }

    if let Some((items, _closing_bracket)) = parse_array_items(trimmed) {
        let len = items.len();

        // Check if any item is itself an array literal
        let has_nested_arrays = items.iter().any(|item| item.trim().starts_with('['));

        if has_nested_arrays && len > 0 {
            // Determine inner dimensions by recursively compiling first element
            let (first_body, first_init, inner_dims) = compile_array_item(&items[0], ctx)?;

            // Compile remaining items
            let mut compiled_items = vec![first_init];
            let mut body = first_body;
            for item in &items[1..] {
                let (item_body, item_init, _) = compile_array_item(item, ctx)?;
                body.push_str(&item_body);
                compiled_items.push(item_init);
            }

            // Build multidimensional array: int name[len][inner_dims] = { items };
            let dims = if inner_dims.is_empty() {
                format!("[{}]", len)
            } else {
                format!("[{}]{}", len, inner_dims)
            };

            let c_decl = format!(
                "{}\n\tint {}{} = {{{}}};;",
                body,
                var_name,
                dims,
                compiled_items.join(", ")
            );
            let (final_body, final_result) = compile_expression(final_part, ctx)?;
            return Ok((format!("{}\n{}", c_decl, final_body), final_result));
        } else {
            // Flat array - compile each element as an expression
            let mut compiled_items = Vec::new();
            let mut body = String::new();
            for item in &items {
                let (item_body, item_result) = compile_expression(item, ctx)?;
                body.push_str(&item_body);
                compiled_items.push(item_result);
            }

            let c_decl = format!(
                "{}\n\tint {}[{}] = {{{}}};",
                body,
                var_name,
                len,
                compiled_items.join(", ")
            );
            let (final_body, final_result) = compile_expression(final_part, ctx)?;
            return Ok((format!("{}\n{}", c_decl, final_body), final_result));
        }
    }

    // Fallback: treat as scalar
    let (decl_body, decl_result) = compile_expression(array_expr, ctx)?;
    let c_body = format!("{}\n\tint {} = {};", decl_body, var_name, decl_result);
    let (final_body, final_result) = compile_expression(final_part, ctx)?;
    Ok((format!("{}\n{}", c_body, final_body), final_result))
}

/// Compile a single array item, returning (body statements, initializer string, dimension suffix).
/// Dimension suffix is like "[3]" for an inner array of size 3.
fn compile_array_item(
    item: &str,
    ctx: &mut CompileContext,
) -> Result<(String, String, String), CompileError> {
    let trimmed = item.trim();

    if trimmed.starts_with('[') {
        // Nested array - recurse
        if let Some((items, _closing_bracket)) = parse_array_items(trimmed) {
            let len = items.len();

            let mut compiled_items = Vec::new();
            let mut body = String::new();
            let mut has_nested = false;

            for sub_item in &items {
                let (sub_body, sub_result, sub_dims) = compile_array_item(sub_item, ctx)?;
                body.push_str(&sub_body);
                compiled_items.push(sub_result);
                if !sub_dims.is_empty() {
                    has_nested = true;
                }
            }

            if has_nested && !compiled_items.is_empty() {
                let dims = format!("[{}]", len);
                let init = format!("{{{}}}", compiled_items.join(", "));
                return Ok((body, init, dims));
            }

            let dims = format!("[{}]", len);
            let init = format!("{{{}}}", compiled_items.join(", "));
            Ok((body, init, dims))
        } else {
            // Malformed - fall through to expression compilation
            let (body, result) = compile_expression(trimmed, ctx)?;
            Ok((body, result, String::new()))
        }
    } else {
        // Scalar item
        let (body, result) = compile_expression(trimmed, ctx)?;
        Ok((body, result, String::new()))
    }
}

/// Recursively compile a Tuff expression, returning (C statements, return expression).
fn compile_expression(
    expr: &str,
    ctx: &mut CompileContext,
) -> Result<(String, String), CompileError> {
    let trimmed = expr.trim();

    // Handle empty expressions.
    if trimmed.is_empty() {
        return Ok((String::new(), String::from("")));
    }

    // Check for plain reassignment: "x = <expr>; <final>" (no "let", no "if", no "while", no "for", no "fn")
    if !trimmed.starts_with("let ")
        && !trimmed.starts_with('{')
        && !trimmed.starts_with("if ")
        && !trimmed.starts_with("while ")
        && !trimmed.starts_with("for ")
        && !trimmed.starts_with("fn ")
    {
        if let Some(semi_pos) = find_top_level_semicolon(trimmed) {
            let assign_part = &trimmed[..semi_pos];
            let final_part = &trimmed[semi_pos + 1..];
            // Check if it's an assignment (contains '=' at top level)
            if let Some(eq_pos) = find_top_level_char(assign_part, '=') {
                // Check for compound assignment operators: += -= *= /=
                // The '=' found by find_top_level_char is the one in "+=" etc., so look back 1 char.
                let (var_name, op, rhs_start_offset) = if eq_pos >= 1 {
                    let prev_ch = assign_part.chars().nth(eq_pos - 1);
                    match prev_ch {
                        Some('+') => (&assign_part[..eq_pos - 1], Some('+'), eq_pos + 1), // skip '=' only
                        Some('-') => (&assign_part[..eq_pos - 1], Some('-'), eq_pos + 1),
                        Some('*') => (&assign_part[..eq_pos - 1], Some('*'), eq_pos + 1),
                        Some('/') => (&assign_part[..eq_pos - 1], Some('/'), eq_pos + 1),
                        _ => (&assign_part[..eq_pos], None, eq_pos + 1), // plain '='
                    }
                } else {
                    (&assign_part[..eq_pos], None, eq_pos + 1)
                };
                let var_name = var_name.trim();
                // Extract base variable name (e.g., "x" from "x[0]")
                let base_var = var_name.split('[').next().unwrap_or(var_name);
                // Check if variable was declared as mutable
                if !ctx.mutable_vars.iter().any(|v| v == base_var) {
                    return Err(format!("Cannot reassign immutable variable '{}'", base_var));
                }
                let rhs = assign_part[rhs_start_offset..].trim();
                let (assign_body, assign_result) = compile_expression(rhs, ctx)?;
                let c_body = match op {
                    Some(op_char) => format!(
                        "{}\n\t{} {}= {};",
                        assign_body, var_name, op_char, assign_result
                    ),
                    None => format!("{}\n\t{} = {};", assign_body, var_name, assign_result),
                };
                let final_result = compile_expression(final_part, ctx).map(|r| r.1)?;
                return Ok((c_body, final_result));
            }
        }
    }

    // Check for let declaration pattern: "let x = <expr>; <final>"
    if let Some(decl_expr) = trimmed.strip_prefix("let ") {
        // Find the top-level semicolon (not inside braces)
        if let Some(semi_pos) = find_top_level_semicolon(decl_expr) {
            let decl_part = &decl_expr[..semi_pos];
            let final_part = &decl_expr[semi_pos + 1..];

            // Extract variable name, mutability, and optional type annotation
            let (var_name, is_mut, type_annotation) = parse_let_declaration(decl_part);

            // Track mutable variables
            if is_mut {
                ctx.mutable_vars.push(var_name.to_string());
            }

            // Extract the expression after '=' (split only on first '=')
            let after_eq = decl_part.splitn(2, '=').nth(1).unwrap_or("").trim();

            // Check for array literal: [expr1, expr2, ...]
            if after_eq.starts_with('[') {
                if let Some(closing_bracket) = find_matching_bracket(after_eq) {
                    // Count items in the array
                    let array_content = &after_eq[1..closing_bracket];
                    let item_count = if array_content.trim().is_empty() {
                        0
                    } else {
                        array_content.split(',').count()
                    };

                    // If there's a non-array type annotation, this is a type error
                    if let Some(ty) = &type_annotation {
                        let upper = ty.to_uppercase();
                        if !upper.contains("ARRAY") && !upper.contains('[') {
                            return Err(format!("Type mismatch: expected {} but got array", ty));
                        }
                        // Check array size if type specifies one (e.g., [I32; 1])
                        if let Some(expected_size) = parse_array_size(ty) {
                            if item_count != expected_size {
                                return Err(format!(
                                    "Array size mismatch: expected {} but got {}",
                                    expected_size, item_count
                                ));
                            }
                        }
                    }
                    return compile_array_decl(var_name, after_eq, final_part, ctx);
                }
            }

            // If type annotation expects an array but RHS is not an array literal, error
            if let Some(ty) = &type_annotation {
                if ty.contains('[') && !after_eq.starts_with('[') {
                    return Err(format!(
                        "Type mismatch: expected array but got {}",
                        after_eq
                    ));
                }
            }

            // Recursively compile the declaration's expression
            let (decl_body, decl_result) = compile_expression(after_eq, ctx)?;

            // Handle shadowing: if variable already declared, generate assignment instead of redeclaration
            let c_decl = if ctx.declared_vars.contains(var_name) {
                format!("{}\n\t{} = {};", decl_body, var_name, decl_result)
            } else {
                ctx.declared_vars.insert(var_name.to_string());
                format!("{}\n\tint {} = {};", decl_body, var_name, decl_result)
            };

            let (final_body, final_result) = compile_expression(final_part, ctx)?;
            return Ok((format!("{}\n{}", c_decl, final_body), final_result));
        }
    }

    // Handle blocks { ... } - check if block contains let declarations or assignments
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        let inner = &trimmed[1..trimmed.len() - 1].trim();
        // If inner content has statements (let decls, assignments with semicolons), process recursively
        if inner.contains("let ") || find_top_level_semicolon(inner).is_some() {
            let (block_body, block_result) = compile_expression(inner, ctx)?;
            return Ok((block_body, block_result));
        }
        // Otherwise convert to parentheses for grouping expressions
        let mut result = String::new();
        result.push('(');
        for ch in inner.chars() {
            match ch {
                '{' => result.push('('),
                '}' => result.push(')'),
                _ => result.push(ch),
            }
        }
        result.push(')');
        return Ok((String::new(), result));
    }

    // Check if expression contains embedded blocks with statements (let decls or assignments)
    // e.g., "read() + { let x = read(); x }"  OR  "{ x = read(); } x"
    // We look for any block that has internal semicolons (statements, not just grouping).
    // Skip this check if the expression starts with "if " - let the if/else handler deal with brace-delimited branches.
    if !trimmed.starts_with("if ")
        && trimmed.contains('{')
        && (find_top_level_semicolon(trimmed).is_some()
            || trimmed.contains("{ let ")
            || trimmed.contains("= "))
    {
        for (brace_pos, ch) in trimmed.char_indices() {
            if ch == '{' {
                let remaining = &trimmed[brace_pos..];
                if let Some(block_len) = find_matching_brace(remaining) {
                    let block_content = &trimmed[brace_pos + 1..brace_pos + block_len - 1].trim();

                    // Only treat as statement block if it contains semicolons or let declarations inside
                    let has_statements = find_top_level_semicolon(block_content).is_some()
                        || block_content.contains("let ");
                    if !has_statements {
                        continue;
                    }

                    let before = &trimmed[..brace_pos];
                    let after = &trimmed[brace_pos + block_len + 1..];

                    // Compile "before" FIRST (source order), then the block's statements
                    let (before_body, before_result) = if !before.trim().is_empty() {
                        compile_expression(before.trim(), ctx)?
                    } else {
                        (String::new(), String::new())
                    };

                    let (block_body, block_result) = compile_expression(block_content, ctx)?;

                    if !before.trim().is_empty() {
                        let combined_body = format!("{}{}", before_body, block_body);

                        if !after.trim().is_empty() {
                            // "after" provides the final return expression
                            let (_, after_result) = compile_expression(after.trim(), ctx)?;
                            let combined_expr =
                                format!("{}({}){}", before_result, block_result, after_result);
                            return Ok((combined_body, combined_expr));
                        } else {
                            // Block is the final part of expression: before(block_result)
                            let combined_expr = format!("{}({})", before_result, block_result);
                            return Ok((combined_body, combined_expr));
                        }
                    } else if !after.trim().is_empty() {
                        // No "before", but there's an expression after the block
                        let (_, after_result) = compile_expression(after.trim(), ctx)?;
                        return Ok((block_body, after_result));
                    } else {
                        return Ok((block_body, block_result));
                    }
                }
            }
        }
    }

    // Helper: parse "keyword (cond) rest" → (&cond, &rest)
    fn parse_cond_and_rest(input: &str, keyword_len: usize) -> Option<(&str, &str)> {
        let after_kw = &input[keyword_len..];
        let paren_end = find_matching_paren(after_kw)?;
        let cond = &after_kw[1..paren_end];
        let rest = &after_kw[paren_end + 2..].trim();
        Some((cond, rest))
    }

    // Handle while loop: "while (cond) body; remaining" → "while (cond) { body; }"
    if trimmed.starts_with("while ") {
        let (cond, rest) = parse_cond_and_rest(trimmed, 6).unwrap();

        // Check if there's a semicolon separating the loop body from what follows.
        let (body_stmts, body_result) = if let Some(semi_pos) = find_top_level_semicolon(rest) {
            compile_expression(&rest[..semi_pos], ctx)?
        } else {
            compile_expression(rest, ctx)?
        };

        let (_, cond_result) = compile_expression(cond, ctx)?;
        let c_stmt = build_c_block("while", &cond_result, &body_stmts, &body_result);

        // If there's content after the while loop (e.g., "; x"), use it as return.
        if let Some(semi_pos) = find_top_level_semicolon(rest) {
            let after_while = rest[semi_pos + 1..].trim();
            if !after_while.is_empty() {
                let (_, after_result) = compile_expression(after_while, ctx)?;
                return Ok((c_stmt, after_result));
            }
        }

        return Ok((c_stmt, String::new()));
    }

    // Handle for-in-range loop: "for (i in start..end) body; remaining"
    if trimmed.starts_with("for ") {
        let paren_start = 4; // skip "for "
        let paren_end = find_matching_paren(&trimmed[paren_start..]).unwrap();
        let for_header = &trimmed[paren_start + 1..paren_start + paren_end];
        let rest = &trimmed[paren_start + paren_end + 2..].trim();

        // Parse "i in start..end"
        let in_parts: Vec<&str> = for_header.splitn(2, "in ").collect();
        if in_parts.len() == 2 {
            let var_name = in_parts[0].trim();
            let range_str = in_parts[1].trim();

            // Parse start..end (compile both bounds)
            let dotdot_pos = range_str.find("..").unwrap();
            let start_expr = &range_str[..dotdot_pos];
            let end_expr = &range_str[dotdot_pos + 2..];

            let (_, start_result) = compile_expression(start_expr, ctx)?;
            let (_, end_result) = compile_expression(end_expr, ctx)?;

            // Compile loop body — split on semicolon if there's a trailing expression.
            let (body_stmts, body_result) = if let Some(semi_pos) = find_top_level_semicolon(rest) {
                compile_expression(&rest[..semi_pos], ctx)?
            } else {
                compile_expression(rest, ctx)?
            };

            // Generate C for loop: "for (int i = start; i < end; i++) { body; }"
            let header = format!(
                "for (int {} = {}; {} < {}; {}++)",
                var_name, start_result, var_name, end_result, var_name
            );
            let c_stmt = build_c_block_with_header(&header, &body_stmts, &body_result);

            // If there's content after the for loop (e.g., "; sum"), use it as return.
            if let Some(semi_pos) = find_top_level_semicolon(rest) {
                let after_for = rest[semi_pos + 1..].trim();
                if !after_for.is_empty() {
                    let (_, after_result) = compile_expression(after_for, ctx)?;
                    return Ok((c_stmt, after_result));
                }
            }

            return Ok((c_stmt, String::new()));
        } else {
            // Fallback for unexpected syntax — treat as error.
            return Err(format!("Invalid for loop syntax: {}", for_header));
        }
    }

    // Handle function definition: "fn name(params) => body; remaining"
    if trimmed.starts_with("fn ") {
        let after_fn = &trimmed[3..];
        // Find the opening paren to get function name
        let paren_pos = after_fn
            .find('(')
            .ok_or_else(|| format!("Invalid fn syntax: {}", after_fn))?;
        let func_name = after_fn[..paren_pos].trim();

        // Parse parameters inside parens
        let params_str_start = paren_pos + 1;
        let params_paren_end = find_matching_paren(&after_fn[params_str_start - 1..])
            .ok_or_else(|| format!("Invalid fn syntax: missing closing paren"))?;
        let params_inner =
            &after_fn[params_str_start..params_str_start + params_paren_end - 1].trim();

        // Parse each parameter: "name : Type" or just "name"
        let mut param_names: Vec<String> = Vec::new();
        if !params_inner.is_empty() {
            for param in params_inner.split(',') {
                let parts: Vec<&str> = param.trim().split(':').collect();
                let name = parts[0].trim();
                if !name.is_empty() {
                    param_names.push(name.to_string());
                }
            }
        }

        // Find optional return type annotation and "=>" after the params
        let after_params = &after_fn[params_str_start + params_paren_end..];

        // Check for ": ReturnType =>" or just "=>"
        if !after_params.contains("=>") {
            return Err(format!(
                "Invalid fn syntax: expected '=>' but got '{}'",
                after_params
            ));
        }
        let arrow_pos = after_params.find("=>").unwrap();
        let body_and_rest = &after_params[arrow_pos + 2..].trim(); // skip "=>"

        // Find semicolon separating function definition from remaining code
        if let Some(semi_pos) = find_top_level_semicolon(body_and_rest) {
            let func_body = &body_and_rest[..semi_pos];
            let remaining = &body_and_rest[semi_pos + 1..].trim();

            // Generate C function with its own local reads
            let fn_read_entries = find_reads_in_order(func_body);
            let mut fn_ctx = CompileContext {
                vars: (0..fn_read_entries.len())
                    .map(|i| format!("v{}", i))
                    .collect(),
                var_idx: 0,
                mutable_vars: Vec::new(),
                declared_vars: HashSet::new(),
                generated_functions: Vec::new(), // nested fn not supported yet
            };

            // Add parameters as pre-declared variables in the function context
            for name in &param_names {
                fn_ctx.declared_vars.insert(name.clone());
            }

            let (fn_body_stmts, fn_return_expr) = compile_expression(func_body, &mut fn_ctx)?;

            // Build C function signature with parameters
            let param_sig: Vec<String> = param_names.iter().map(|n| format!("int {}", n)).collect();
            let sig_str = if param_sig.is_empty() {
                "void"
            } else {
                &param_sig.join(", ")
            };
            let mut c_func = format!("int {}({}) {{\n", func_name, sig_str);

            // Add local reads after parameters
            if !fn_read_entries.is_empty() {
                for (i, (_pos, entry_type)) in fn_read_entries.iter().enumerate() {
                    let var_name = &format!("v{}", i);
                    match entry_type {
                        ReadType::Int => {
                            c_func.push_str(&format!("\t\tint {};\n", var_name));
                            c_func.push_str(&format!("\t\tscanf(\"%d\", &{});\n", var_name));
                        }
                        ReadType::Bool => {
                            c_func.push_str(&format!("\t\tint {};\n", var_name));
                            c_func.push_str(&format!("\t\tchar buf[64];\n"));
                            c_func.push_str(&format!(
                                "\t\tscanf(\"%63s\", buf);{} = strcmp(buf, \"true\") == 0 || buf[0] == '1';\n",
                                var_name
                            ));
                        }
                    }
                }
            }

            if !fn_body_stmts.is_empty() {
                c_func.push_str(&fn_body_stmts);
            }
            c_func.push_str(&format!("\t\treturn {};\n}}\n", fn_return_expr));

            ctx.generated_functions
                .push((func_name.to_string(), param_names, c_func));

            // Compile remaining expression after the function definition
            if !remaining.is_empty() {
                return compile_expression(remaining, ctx);
            }

            return Ok((String::new(), String::new()));
        } else {
            return Err(format!("Invalid fn syntax: missing semicolon after body"));
        }
    }

    // Handle if/else expression: "if (cond) a else b" → "(cond ? a : b)" or block form for statements.
    // Or statement form: "if (cond) stmt;" → "if (cond) { stmt; }"
    if trimmed.starts_with("if ") {
        let (cond, rest) = parse_cond_and_rest(trimmed, 3).unwrap();

        // Find "else" keyword (not inside parens)
        if let Some(else_pos) = find_top_level_else(rest) {
            let then_expr = &rest[..else_pos].trim();
            let else_expr = &rest[else_pos + "else".len()..].trim();

            // Check if either branch is a statement (contains assignment at top level or inside braces).
            fn has_assignment_in(s: &str) -> bool {
                find_top_level_char(s, '=').is_some() || {
                    let trimmed = s.trim();
                    // Also check inside brace-delimited blocks.
                    if trimmed.starts_with('{') && trimmed.ends_with('}') && trimmed.len() >= 2 {
                        let inner = &trimmed[1..trimmed.len() - 1];
                        find_top_level_char(inner, '=').is_some()
                    } else {
                        false
                    }
                }
            }
            let then_is_stmt = has_assignment_in(then_expr);
            let else_is_stmt = has_assignment_in(else_expr);

            let (_, cond_result) = compile_expression(cond, ctx)?;

            if then_is_stmt || else_is_stmt {
                // Generate C if/else block form for statements.
                let (then_body, then_result) = compile_expression(then_expr, ctx)?;

                // Check if else branch has a trailing semicolon with content after it.
                // Also check for brace-delimited blocks followed by content: "{ x = read(); } x"
                let mut else_part: &str = else_expr;
                let after_else: &str = if let Some(semi_pos) = find_top_level_semicolon(else_expr) {
                    else_part = &else_expr[..semi_pos];
                    &else_expr[semi_pos + 1..]
                } else {
                    // Check for brace-delimited block followed by content.
                    let trimmed_else = else_expr.trim();
                    if let Some(block_len) = find_matching_brace(trimmed_else) {
                        // Content after the closing brace (block_len is index of '}').
                        let after_block = &trimmed_else[block_len + 1..].trim();
                        if !after_block.is_empty() {
                            else_part = &trimmed_else[..=block_len]; // Include the closing brace.
                            after_block
                        } else {
                            ""
                        }
                    } else {
                        ""
                    }
                };

                let (else_body, else_result) = compile_expression(else_part.trim(), ctx)?;

                // Build if/else block with bodies inside.
                let mut c_stmt = String::new();
                c_stmt.push_str(&format!("\tif ({}) {{\n", cond_result));
                if !then_body.is_empty() {
                    for line in then_body.lines() {
                        c_stmt.push('\t');
                        c_stmt.push_str(line);
                        c_stmt.push('\n');
                    }
                }
                // Only add result line if there's a non-empty result (avoid empty semicolons).
                if !then_result.is_empty() {
                    c_stmt.push_str(&format!("\t\t{};\n", then_result));
                }
                c_stmt.push_str("\t} else {\n");
                if !else_body.is_empty() {
                    for line in else_body.lines() {
                        c_stmt.push('\t');
                        c_stmt.push_str(line);
                        c_stmt.push('\n');
                    }
                }
                // Only add result line if there's a non-empty result.
                if !else_result.is_empty() {
                    c_stmt.push_str(&format!("\t\t{};\n", else_result));
                }
                c_stmt.push_str("\t}");

                // If there's content after the else branch (e.g., "; x"), use it as return.
                let ret = if !after_else.trim().is_empty() {
                    compile_expression(after_else.trim(), ctx).map(|r| r.1)?
                } else {
                    String::new()
                };

                return Ok((c_stmt, ret));
            } else {
                // Pure expressions — use ternary.
                let (_, then_result) = compile_expression(then_expr, ctx)?;
                let (_, else_result) = compile_expression(else_expr, ctx)?;

                return Ok((
                    String::new(),
                    format!("({} ? {} : {})", cond_result, then_result, else_result),
                ));
            }
        } else {
            // No else — treat as statement: "if (cond) body" or "if (cond) body; remaining..."
            let (_, cond_result) = compile_expression(cond, ctx)?;

            // Check if rest has a top-level semicolon separating then-body from what follows
            if let Some(semi_pos) = find_top_level_semicolon(rest) {
                let then_part = &rest[..semi_pos].trim();
                let after_part = &rest[semi_pos + 1..].trim();

                let (then_body, then_result) = compile_expression(then_part, ctx)?;
                let c_stmt = format!(
                    "{}\n\tif ({}) {{\n\t\t{};\n\t}}",
                    then_body, cond_result, then_result
                );

                if !after_part.is_empty() {
                    let (_, after_result) = compile_expression(after_part, ctx)?;
                    return Ok((c_stmt, after_result));
                } else {
                    return Ok((c_stmt, String::new()));
                }
            } else {
                // No semicolon — entire rest is the then-body
                let (then_body, then_result) = compile_expression(rest, ctx)?;
                let c_stmt = format!(
                    "{}\n\tif ({}) {{\n\t\t{};\n\t}}",
                    then_body, cond_result, then_result
                );
                return Ok((c_stmt, String::new()));
            }
        }
    }

    // Base case: replace read<T>() and read() with variables, convert braces to parens.
    let mut result = String::new();

    fn copy_chars(s: &str, out: &mut String) {
        for ch in s.chars() {
            match ch {
                '{' => out.push('('),
                '}' => out.push(')'),
                _ => out.push(ch),
            }
        }
    }

    // First pass: handle generic reads like read<Bool>(), etc.
    let mut last = 0;
    for m in trimmed.match_indices("read<") {
        copy_chars(&trimmed[last..m.0], &mut result);
        let rest = &trimmed[m.0 + m.1.len()..]; // after "read<"
        if let Some(end_pos) = rest.find(">()") {
            result.push_str(&ctx.vars[ctx.var_idx]);
            ctx.var_idx += 1;
            last = m.0 + m.1.len() + end_pos + ">()".len();
        } else {
            // Fallback: copy literally (shouldn't happen with valid input)
            for ch in trimmed[m.0..].chars() {
                result.push(ch);
            }
            last = trimmed.len();
        }
    }

    // Second pass: handle plain read() calls on remaining text after generics.
    let remaining_start = last;
    let remaining = &trimmed[remaining_start..];
    for (i, m) in remaining.match_indices("read()").enumerate() {
        if i == 0 && m.0 == 0 {
            copy_chars(&remaining[..m.0], &mut result);
        } else {
            // Copy text between previous match end and this one
            let prev_end = last;
            copy_chars(&trimmed[prev_end..remaining_start + m.0], &mut result);
        }
        result.push_str(&ctx.vars[ctx.var_idx]);
        ctx.var_idx += 1;
        last = remaining_start + m.0 + "read()".len();
    }
    // Copy any trailing text after last read().
    copy_chars(&trimmed[last..], &mut result);

    // Check if this is a function call: name(args)
    let paren_idx = trimmed.find('(');
    if let Some(pi) = paren_idx {
        // Check if the part before '(' matches a known function name (no dots, spaces, etc.)
        let potential_name = &trimmed[..pi];
        if !potential_name.contains(|c: char| c == ' ')
            && ctx
                .generated_functions
                .iter()
                .any(|(name, _, _)| name == potential_name)
        {
            // Find matching closing paren
            if let Some(paren_end) = find_matching_paren(&trimmed[pi..]) {
                let args_str = &trimmed[pi + 1..pi + paren_end].trim();

                // Compile arguments
                let mut compiled_args: Vec<String> = Vec::new();
                if !args_str.is_empty() {
                    for arg in args_str.split(',') {
                        let (_, arg_result) = compile_expression(arg.trim(), ctx)?;
                        compiled_args.push(arg_result);
                    }
                }

                // Build function call expression
                return Ok((
                    String::new(),
                    format!("{}({})", potential_name, compiled_args.join(", ")),
                ));
            }
        }
    }

    Ok((String::new(), result))
}

/// Find the index of the matching closing brace for an opening brace at position 0.
fn find_matching_brace(s: &str) -> Option<usize> {
    if !s.starts_with('{') {
        return None;
    }
    let mut depth = 0;
    for (i, ch) in s.chars().enumerate() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Find the index of the matching closing bracket for an opening bracket at position 0.
fn find_matching_bracket(s: &str) -> Option<usize> {
    if !s.starts_with('[') {
        return None;
    }
    let mut depth = 0;
    for (i, ch) in s.chars().enumerate() {
        match ch {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Find the index of a top-level semicolon (not inside any braces or brackets).
fn find_top_level_semicolon(s: &str) -> Option<usize> {
    find_top_level_char(s, ';')
}

/// Find matching closing paren for opening paren at position 0.
/// Skips content inside angle brackets used as type parameters (e.g., read<Bool>()),
/// but treats standalone < and > as regular characters (comparison operators).
fn find_matching_paren(s: &str) -> Option<usize> {
    if !s.starts_with('(') {
        return None;
    }
    let mut depth = 0;
    let mut angle_depth = 0; // tracks nested <...> for type parameters
    let chars: Vec<char> = s.chars().collect();
    for (i, ch) in chars.iter().enumerate() {
        match *ch {
            '<' if i > 0 && chars[i - 1].is_alphanumeric() => angle_depth += 1,
            '>' if angle_depth > 0 => angle_depth -= 1,
            '(' if angle_depth == 0 => depth += 1,
            ')' if angle_depth == 0 => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Find "else" keyword at top level (not inside parens/braces).
fn find_top_level_else(s: &str) -> Option<usize> {
    for i in 0..s.len().saturating_sub(3) {
        if s[i..].starts_with("else ") || &s[i..] == "else" {
            // Ensure it's a standalone keyword, not part of another word
            let before_ok =
                i == 0 || !matches!(s.chars().nth(i.saturating_sub(1)), Some('a'..='z'));
            if before_ok {
                return Some(i);
            }
        }
    }
    None
}

/// Build a C block statement with a custom header line.
/// e.g., "for (int i = 0; i < n; i++) { body; }"
fn build_c_block_with_header(header: &str, body_stmts: &str, body_result: &str) -> String {
    let mut c_stmt = String::new();
    c_stmt.push_str(&format!("\t{} {{\n", header));
    if !body_stmts.is_empty() {
        for line in body_stmts.lines() {
            c_stmt.push('\t');
            c_stmt.push_str(line);
            c_stmt.push('\n');
        }
    }
    if !body_result.is_empty() {
        c_stmt.push_str(&format!("\t\t{};\n", body_result));
    }
    c_stmt.push_str("\t}");
    c_stmt
}

/// Build a C block statement like "while (cond) { body; }" or "if (cond) { stmt; }".
fn build_c_block(keyword: &str, cond_result: &str, body_stmts: &str, body_result: &str) -> String {
    let header = format!("{} ({})", keyword, cond_result);
    build_c_block_with_header(&header, body_stmts, body_result)
}

#[allow(dead_code)]
fn expect_valid(source: &str, std_in: &str, expected_exit_code: i32) {
    fn save_to_temp_path(generated: &str) -> String {
        let dir = std::env::temp_dir();
        let id = TEMP_COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = dir.join(format!("tuff_test_{}_{}.c", std::process::id(), id));
        let mut file = std::fs::File::create(&path).expect("Failed to create temp file");
        file.write_all(generated.as_bytes())
            .expect("Failed to write temp file");
        path.to_str().unwrap().to_string()
    }

    fn compile_temp_path_using_clang(temp_path: &str) -> String {
        let exe_path = temp_path.replace(".c", ".exe");
        // Ensure the .c file exists and has content before compiling
        if std::fs::read_to_string(temp_path).is_err()
            || std::fs::metadata(temp_path).unwrap().len() == 0
        {
            panic!("Temp C source file is empty or missing: {}", temp_path);
        }

        let output = Command::new("clang")
            .args([temp_path, "-o", &exe_path])
            .output();

        match output {
            Ok(result) if result.status.success() => exe_path.to_string(),
            _ => {
                // Extract stderr before the temporary is dropped
                let stderr_bytes = match &output {
                    Ok(r) => r.stderr.clone(),
                    Err(e) => panic!("Failed to run clang: {}", e),
                };
                let stderr = String::from_utf8_lossy(&stderr_bytes);
                panic!("clang compilation failed:\n{}", stderr);
            }
        }
    }

    fn execute_temp_exe(temp_exe: &str, stdin: &str) -> i32 {
        let mut child = Command::new(temp_exe)
            .stdin(std::process::Stdio::piped())
            .spawn()
            .expect("Failed to start compiled exe");
        // Write stdin if provided
        if !stdin.is_empty() {
            if let Some(ref mut stdin_handle) = child.stdin {
                use std::io::Write;
                stdin_handle
                    .write_all(stdin.as_bytes())
                    .expect("Failed to write to stdin");
            }
        }
        let status = child.wait().expect("Failed to wait for exe");
        status.code().unwrap_or(-1)
    }

    let generated_result = compile(source);
    if let Err(error) = generated_result {
        panic!("{}", error);
    }

    let generated: String = generated_result.unwrap();
    let temp_path = save_to_temp_path(&generated.as_str());
    let temp_exe = compile_temp_path_using_clang(temp_path.as_str());
    let actual_exit_code = execute_temp_exe(temp_exe.as_str(), std_in);

    // Cleanup
    let _ = std::fs::remove_file(&temp_path);
    let _ = std::fs::remove_file(&temp_exe);

    if actual_exit_code != expected_exit_code {
        panic!(
            "Expected exit code '{}' but was actually '{}'. Generated: '{}'",
            expected_exit_code, actual_exit_code, generated
        );
    }
}

#[allow(dead_code)]
fn expect_invalid(source: &str) {
    let result = compile(source);
    if let Ok(generated) = result {
        panic!(
            "Expected an error but compiler actually produced: '{}'",
            generated
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_source() {
        expect_valid("", "", 0);
    }

    #[test]
    fn test_whitespace_source() {
        expect_valid(" ", "", 0);
    }

    #[test]
    fn test_read_stdin() {
        expect_valid("read()", "1", 1);
    }

    #[test]
    fn test_read_stdin_multiple() {
        expect_valid("read()", "1 2", 1);
    }

    #[test]
    fn test_read_with_whitespace() {
        expect_valid(" read() ", "1 2", 1);
    }

    #[test]
    fn test_read_add_read() {
        expect_valid("read() + read()", "1 2", 3);
    }

    #[test]
    fn test_read_add_read_add_read() {
        expect_valid("read() + read() + read()", "1 2 3", 6);
    }

    #[test]
    fn test_read_add_read_sub_read() {
        expect_valid("read() + read() - read()", "3 4 5", 2);
    }

    #[test]
    fn test_read_with_braces() {
        expect_valid("read() + { read() - read() }", "3 4 5", 2);
    }

    #[test]
    fn test_read_with_let() {
        expect_valid("read() + { let x = read() - read(); x }", "3 4 5", 2);
    }

    #[test]
    fn test_nested_let() {
        expect_valid(
            "let y = read() + { let x = read() - read(); x }; y",
            "3 4 5",
            2,
        );
    }

    #[test]
    fn test_array_let() {
        expect_valid("let y = [read()]; y[0]", "3", 3);
    }

    #[test]
    fn test_nested_array_let() {
        expect_valid("let y = [[read()]]; y[0][0]", "3", 3);
    }

    #[test]
    fn test_nested_array_literal() {
        expect_valid("let y = [[ 3 ]]; y[0][0]", "", 3);
    }

    #[test]
    fn test_typed_let() {
        expect_valid("let x : I32 = 100; x", "", 100);
    }

    #[test]
    fn test_typed_let_array_mismatch() {
        expect_invalid("let x : I32 = [100]; x");
    }

    #[test]
    fn test_typed_array_let() {
        expect_valid("let x : [I32; 1] = [100]; x[0]", "", 100);
    }

    #[test]
    fn test_typed_array_size_mismatch() {
        expect_invalid("let x : [I32; 1] = []; x[0]");
    }

    #[test]
    fn test_typed_array_scalar_rhs() {
        expect_invalid("let x = read(); let y : [I32; 3] = x;");
    }

    #[test]
    fn test_mut_reassign() {
        expect_valid("let mut x = read(); x = read(); x", "1 2", 2);
    }

    #[test]
    fn test_mut_compound_assign() {
        expect_valid("let mut x = read(); x += read(); x", "1 3", 4);
    }

    #[test]
    fn test_compound_assign_without_mut() {
        expect_invalid("let x = read(); x += read(); x");
    }

    #[test]
    fn test_reassign_without_mut() {
        expect_invalid("let x = read(); x = read(); x");
    }

    #[test]
    fn test_mut_array_element_assign() {
        expect_valid("let mut x = [read()]; x[0] = read(); x[0]", "1 2", 2);
    }

    #[test]
    fn test_array_element_assign_without_mut() {
        expect_invalid("let x = [read()]; x[0] = read(); x[0]");
    }

    #[test]
    fn test_array_repeat_syntax() {
        expect_valid("let x = [10; 2]; x[0] + x[1]", "", 20);
    }

    #[test]
    fn test_array_repeat_with_read() {
        expect_valid("let x = [read(); 2]; x[0] + x[1]", "2 5", 4);
    }

    #[test]
    fn test_bool_read_generic() {
        expect_valid("let x : Bool = read<Bool>(); x", "true", 1);
    }

    #[test]
    fn test_bool_or_false_literal() {
        expect_valid("let x : Bool = read<Bool>(); x || false", "true", 1);
    }

    #[test]
    fn test_bool_and_false_literal() {
        expect_valid("let x : Bool = read<Bool>(); x && false", "true", 0);
    }

    #[test]
    fn test_less_than_comparison() {
        expect_valid("read() < read()", "1 2", 1);
    }

    #[test]
    fn test_equality_comparison_false() {
        expect_valid("read() == read()", "1 2", 0);
    }

    #[test]
    fn test_if_else_bool_read() {
        expect_valid("if (read<Bool>()) 3 else 5", "true", 3);
    }

    #[test]
    fn test_let_with_if_else() {
        expect_valid("let x = if (read<Bool>()) 3 else 5; x", "true", 3);
    }

    #[test]
    fn test_mut_reassign_in_block() {
        expect_valid("let mut x = read(); { x = read(); } x", "1 3", 3);
    }

    #[test]
    fn test_let_shadowing() {
        expect_valid("let x = read(); let x = read(); x", "1 3", 3);
    }

    #[test]
    fn test_if_with_mut_reassign() {
        expect_valid(
            "let mut x = 0; if (read<Bool>()) x = read(); x",
            "true 3",
            3,
        );
    }

    #[test]
    fn test_if_else_with_mut_reassign() {
        // All reads are eagerly evaluated at top of main(), so both branch reads need input.
        expect_valid(
            "let mut x = 0; if (read<Bool>()) x = read(); else x = read() + 1; x",
            "false 0 8",
            9,
        );
    }

    #[test]
    fn test_if_else_brace_blocks_with_mut_reassign() {
        // Explicit brace-delimited if/else blocks with assignments inside.
        // All reads are eagerly evaluated at top of main(), so both branch reads need input.
        expect_valid(
            "let mut x = 0; if (read<Bool>()) { x = read(); } else { x = read() + 1; } x",
            "false 0 8",
            9,
        );
    }

    #[test]
    fn test_while_loop_with_mut_reassign() {
        expect_valid(
            "let mut x = 0; let total = read(); while (x < total) x += 1; x",
            "4",
            4,
        );
    }

    #[test]
    fn test_for_loop_with_mut_reassign() {
        expect_valid(
            "let mut sum = 0; for (i in 0..read()) sum += i; sum",
            "4",
            6,
        );
    }

    #[test]
    fn test_function_call_forwarding_read() {
        expect_valid("fn get() => read(); get()", "100", 100);
    }

    #[test]
    fn test_fn_with_params_and_type_annotation() {
        expect_valid(
            "fn add(offset : I32) : I32 => read() + offset; add(2)",
            "1",
            3,
        );
    }
}
