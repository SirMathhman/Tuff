use core::panic;
use std::io::Write;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};

type CompileError = String;

static TEMP_COUNTER: AtomicU32 = AtomicU32::new(0);

fn main() {
    println!("Hello, world!");
}

fn compile(source: &str) -> Result<String, CompileError> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Ok(String::from("int main() {\n\treturn 0;\n}\n"));
    }

    // Count how many read() calls are in the expression (plain and generic)
    let plain_read_count = trimmed.matches("read()").count();
    let bool_read_count = trimmed.matches("read<Bool>()").count();
    let read_count = plain_read_count + bool_read_count;
    let vars: Vec<String> = (0..read_count).map(|i| format!("v{}", i)).collect();

    // Parse let declarations and build C body
    let mut var_idx = 0;
    let mut mutable_vars: Vec<String> = Vec::new();
    let (c_body, return_expr) = compile_expression(trimmed, &vars, &mut var_idx, &mut mutable_vars)?;

    if read_count > 0 {
        // Generate C code for reads - handle both plain int and Bool types
        let mut c_decls = String::new();
        let mut c_reads = String::new();

        // Integer reads use scanf %d
        if plain_read_count > 0 {
            let scanf_fmt = format!("%d{}", " %d".repeat(plain_read_count - 1));
            let scanf_args: Vec<_> = (0..plain_read_count)
                .map(|i| format!("&v{}", i))
                .collect();
            c_decls.push_str(&format!(
                "\tint {};\n",
                (0..plain_read_count).map(|i| format!("v{}", i)).collect::<Vec<_>>().join(", ")
            ));
            let args_joined = scanf_args.join(", ");
            c_reads.push_str("scanf(\"");
            c_reads.push_str(&scanf_fmt);
            c_reads.push_str("\", ");
            c_reads.push_str(&args_joined);
            c_reads.push_str(");\n");
        }

        // Bool reads use fgets + strcmp
        if bool_read_count > 0 {
            let start_idx = plain_read_count;
            for i in 0..bool_read_count {
                c_decls.push_str(&format!("\tint v{};\n", start_idx + i));
                c_reads.push_str(&format!(
                    "\tfgets(buf, sizeof(buf), stdin);\nv{} = strcmp(buf, \"true\") == 0 || buf[0] == '1';\n",
                    start_idx + i
                ));
            }
        }

        // Build final C program with stdbool.h for boolean support
        let includes = "#include <stdio.h>\n#include <string.h>\n#include <stdbool.h>";
        let buf_decl = "\tchar buf[64];";
        Ok(format!(
            "{}\nint main() {{\n{}\n{}\n\t{}\n\t{}\n\treturn {};\n}}\n",
            includes, buf_decl, c_decls.trim(), c_reads.trim(), c_body, return_expr
        ))
    } else {
        Ok(format!(
            "int main() {{\n\t{}\n\treturn {};\n}}\n",
            c_body, return_expr
        ))
    }
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
    vars: &[String],
    var_idx: &mut usize,
    mutable_vars: &mut Vec<String>,
) -> Result<(String, String), CompileError> {
    let trimmed = array_expr.trim();
    debug_assert!(trimmed.starts_with('['));

    // Check for array repeat syntax: [value; count]
    if let Some((repeat_value, repeat_count)) = parse_array_repeat(trimmed) {
        let (val_body, val_result) = compile_expression(repeat_value, vars, var_idx, mutable_vars)?;
        let repeated: Vec<_> = (0..repeat_count).map(|_| val_result.clone()).collect();
        let init = format!("{{{}}}", repeated.join(", "));
        let c_decl = format!("{}\n\tint {}[{}] = {};", val_body, var_name, repeat_count, init);
        let (final_body, final_result) = compile_expression(final_part, vars, var_idx, mutable_vars)?;
        return Ok((format!("{}\n{}", c_decl, final_body), final_result));
    }

    if let Some((items, _closing_bracket)) = parse_array_items(trimmed) {
        let len = items.len();

        // Check if any item is itself an array literal
        let has_nested_arrays = items.iter().any(|item| item.trim().starts_with('['));

        if has_nested_arrays && len > 0 {
            // Determine inner dimensions by recursively compiling first element
            let (first_body, first_init, inner_dims) =
                compile_array_item(&items[0], vars, var_idx, mutable_vars)?;

            // Compile remaining items
            let mut compiled_items = vec![first_init];
            let mut body = first_body;
            for item in &items[1..] {
                let (item_body, item_init, _) = compile_array_item(item, vars, var_idx, mutable_vars)?;
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
            let (final_body, final_result) = compile_expression(final_part, vars, var_idx, mutable_vars)?;
            return Ok((format!("{}\n{}", c_decl, final_body), final_result));
        } else {
            // Flat array - compile each element as an expression
            let mut compiled_items = Vec::new();
            let mut body = String::new();
            for item in &items {
                let (item_body, item_result) = compile_expression(item, vars, var_idx, mutable_vars)?;
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
            let (final_body, final_result) = compile_expression(final_part, vars, var_idx, mutable_vars)?;
            return Ok((format!("{}\n{}", c_decl, final_body), final_result));
        }
    }

    // Fallback: treat as scalar
    let (decl_body, decl_result) = compile_expression(array_expr, vars, var_idx, mutable_vars)?;
    let c_body = format!("{}\n\tint {} = {};", decl_body, var_name, decl_result);
    let (final_body, final_result) = compile_expression(final_part, vars, var_idx, mutable_vars)?;
    Ok((format!("{}\n{}", c_body, final_body), final_result))
}

/// Compile a single array item, returning (body statements, initializer string, dimension suffix).
/// Dimension suffix is like "[3]" for an inner array of size 3.
fn compile_array_item(
    item: &str,
    vars: &[String],
    var_idx: &mut usize,
    mutable_vars: &mut Vec<String>,
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
                let (sub_body, sub_result, sub_dims) = compile_array_item(sub_item, vars, var_idx, mutable_vars)?;
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
            let (body, result) = compile_expression(trimmed, vars, var_idx, mutable_vars)?;
            Ok((body, result, String::new()))
        }
    } else {
        // Scalar item
        let (body, result) = compile_expression(trimmed, vars, var_idx, mutable_vars)?;
        Ok((body, result, String::new()))
    }
}

/// Recursively compile a Tuff expression, returning (C statements, return expression, next var_idx).
/// `var_idx` tracks which read() variable to assign next.
fn compile_expression(
    expr: &str,
    vars: &[String],
    var_idx: &mut usize,
    mutable_vars: &mut Vec<String>,
) -> Result<(String, String), CompileError> {
    let trimmed = expr.trim();

    // Check for plain reassignment: "x = <expr>; <final>" (no "let")
    if !trimmed.starts_with("let ") && !trimmed.starts_with('{') {
        if let Some(semi_pos) = find_top_level_semicolon(trimmed) {
            let assign_part = &trimmed[..semi_pos];
            let final_part = &trimmed[semi_pos + 1..];
            // Check if it's an assignment (contains '=' at top level)
            if let Some(eq_pos) = find_top_level_char(assign_part, '=') {
                let var_name = assign_part[..eq_pos].trim();
                // Extract base variable name (e.g., "x" from "x[0]")
                let base_var = var_name.split('[').next().unwrap_or(var_name);
                // Check if variable was declared as mutable
                if !mutable_vars.iter().any(|v| v == base_var) {
                    return Err(format!("Cannot reassign immutable variable '{}'", base_var));
                }
                let rhs = assign_part[eq_pos + 1..].trim();
                let (assign_body, assign_result) = compile_expression(rhs, vars, var_idx, mutable_vars)?;
                let c_body = format!("{}\n\t{} = {};", assign_body, var_name, assign_result);
                let final_result = compile_expression(final_part, vars, var_idx, mutable_vars).map(|r| r.1)?;
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
                mutable_vars.push(var_name.to_string());
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
                    return compile_array_decl(var_name, after_eq, final_part, vars, var_idx, mutable_vars);
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
            let (decl_body, decl_result) = compile_expression(after_eq, vars, var_idx, mutable_vars)?;

            let c_body = format!("{}\n\tint {} = {};", decl_body, var_name, decl_result);
            let (final_body, final_result) = compile_expression(final_part, vars, var_idx, mutable_vars)?;
            return Ok((format!("{}\n{}", c_body, final_body), final_result));
        }
    }

    // Handle blocks { ... } - check if block contains let declarations
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        let inner = &trimmed[1..trimmed.len() - 1].trim();
        // If inner content has let declarations, process them
        if inner.contains("let ") && inner.contains(';') {
            return compile_expression(inner, vars, var_idx, mutable_vars);
        }
        // Otherwise convert to parentheses
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

    // Check if expression contains blocks with let declarations
    // e.g., "read() + { let x = read() - read(); x }"
    if trimmed.contains("{ let ") {
        // Find the block and process it separately
        let block_start = trimmed.find("{ let ").unwrap();
        let block_end = find_matching_brace(&trimmed[block_start..]).unwrap() + block_start;

        let before = &trimmed[..block_start];
        let block_content = &trimmed[block_start + 1..block_end - 1].trim();
        let after = &trimmed[block_end + 1..];

        // Process before part
        let (before_body, before_result) = compile_expression(before, vars, var_idx, mutable_vars)?;

        // Process the block's let declaration
        let (block_body, block_result) = compile_expression(block_content, vars, var_idx, mutable_vars)?;

        // Process after part
        let (_, after_result) = compile_expression(after, vars, var_idx, mutable_vars)?;

        let combined_body = format!("{}{}", before_body, block_body);
        let combined_expr = format!("{}({}){}", before_result, block_result, after_result);

        return Ok((combined_body, combined_expr));
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
            result.push_str(&vars[*var_idx]);
            *var_idx += 1;
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
        result.push_str(&vars[*var_idx]);
        *var_idx += 1;
        last = remaining_start + m.0 + "read()".len();
    }
    // Copy any trailing text after last read().
    copy_chars(&trimmed[last..], &mut result);

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
}
