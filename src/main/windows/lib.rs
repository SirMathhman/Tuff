mod brace_utils;
mod control;
mod eval_expr;
mod evaluator;
mod fn_utils;
mod parser;
mod pointer_utils;
mod property_access;
mod range_check;
pub mod statement;

use std::cell::RefCell;

use parser::{detect_suffix_from_tokens, tokenize_expr, tokens_to_rpn};
use range_check::{check_unsigned_range, SUFFIXES};
use statement::{process_single_stmt, split_statements, Var};

// Output buffer for capturing print() function calls
thread_local! {
    static OUTPUT_BUFFER: RefCell<String> = const { RefCell::new(String::new()) };
}

/// Clear the output buffer
fn clear_output_buffer() {
    OUTPUT_BUFFER.with(|buf| buf.borrow_mut().clear());
}

/// Append to the output buffer (called by print() function)
fn append_to_output(value: i32) {
    OUTPUT_BUFFER.with(|buf| {
        let mut output = buf.borrow_mut();
        output.push_str(&value.to_string());
        output.push('\n');
    });
}

/// Get the captured output
fn get_captured_output() -> String {
    OUTPUT_BUFFER.with(|buf| buf.borrow().clone())
}

/// Wrap a result with captured output if any
fn wrap_with_output(result: String) -> String {
    let output = get_captured_output();
    if output.is_empty() {
        result
    } else {
        format!("{}|{}", result, output.trim())
    }
}

fn local_eval_expr_with_env(
    expr: &str,
    env: &std::collections::HashMap<String, Var>,
) -> Result<(String, Option<String>), String> {
    crate::eval_expr::eval_expr_with_env(expr, env)
}

/// Context for module import operations
struct ModuleImportContext<'a> {
    module_name: &'a str,
    item_name: Option<&'a str>,
    source_set: &'a std::collections::HashMap<String, String>,
}

/// Process module exports and optionally filter by item name.
/// If item_name is None, imports all exports. If Some(name), imports only that item.
fn process_module_imports(
    ctx: ModuleImportContext,
    target_env: &mut std::collections::HashMap<String, Var>,
) -> Result<(), String> {
    use std::collections::HashMap;

    let module_source = ctx
        .source_set
        .get(ctx.module_name)
        .ok_or_else(|| format!("module '{}' not found in source set", ctx.module_name))?;

    let module_stmts = split_statements(module_source.trim());
    for module_stmt in module_stmts {
        let module_stmt_trimmed = module_stmt.trim();

        if let Some(export_content) = module_stmt_trimmed.strip_prefix("out ") {
            let export_content = export_content.trim();

            let mut module_env: HashMap<String, Var> = HashMap::new();
            let mut module_last: Option<String> = None;
            process_single_stmt(
                export_content,
                &mut module_env,
                &mut module_last,
                &local_eval_expr_with_env,
            )?;

            if let Some(requested_item) = ctx.item_name {
                // Selective import: only import the requested item
                if let Some(var) = module_env.get(requested_item) {
                    target_env.insert(requested_item.to_string(), var.clone());
                }

                let fn_key = format!("__fn__{}", requested_item);
                if let Some(func) = module_env.get(&fn_key) {
                    target_env.insert(fn_key.clone(), func.clone());

                    let captures_key = format!("__captures__{}", requested_item);
                    if let Some(captures) = module_env.get(&captures_key) {
                        target_env.insert(captures_key.clone(), captures.clone());
                    }
                }
            } else {
                // Import all exports
                for (key, var) in module_env {
                    target_env.insert(key, var);
                }
            }
        }
    }

    Ok(())
}

pub fn interpret_all(
    main_name: &str,
    source_set: std::collections::HashMap<String, String>,
) -> Result<String, String> {
    use std::collections::HashMap;

    // Helper to evaluate an expression with access to the current environment.

    if let Some(main_source) = source_set.get(main_name) {
        let mut env: HashMap<String, Var> = HashMap::new();
        let mut last_value: Option<String> = None;

        // Process the main file, handling use statements
        let stmts = split_statements(main_source.trim());
        for stmt in stmts {
            let stmt_trimmed = stmt.trim();

            // Handle extern use statements: extern use module;
            if let Some(use_content) = stmt_trimmed.strip_prefix("extern use ") {
                let use_content = if let Some(stripped) = use_content.trim().strip_suffix(';') {
                    stripped
                } else {
                    use_content.trim()
                };

                let module_name = use_content.trim();
                let ctx = ModuleImportContext {
                    module_name,
                    item_name: None,
                    source_set: &source_set,
                };
                process_module_imports(ctx, &mut env)?;
            } else if let Some(use_content) = stmt_trimmed.strip_prefix("use ") {
                let use_content = if let Some(stripped) = use_content.trim().strip_suffix(';') {
                    stripped
                } else {
                    use_content.trim()
                };

                // Parse: module::item
                if let Some(double_colon) = use_content.find("::") {
                    let module_name = &use_content[..double_colon];
                    let item_name = &use_content[double_colon + 2..];
                    let ctx = ModuleImportContext {
                        module_name,
                        item_name: Some(item_name),
                        source_set: &source_set,
                    };
                    process_module_imports(ctx, &mut env)?
                } else {
                    return Err(format!("invalid use statement: {}", stmt_trimmed));
                }
            } else if stmt_trimmed.starts_with("extern fn ")
                || stmt_trimmed.starts_with("extern class fn ")
            {
                // extern fn and extern class fn declarations are no-ops (signatures only)
                // The actual function is imported via extern use
                continue;
            } else {
                // Process normal statement
                process_single_stmt(
                    stmt_trimmed,
                    &mut env,
                    &mut last_value,
                    &local_eval_expr_with_env,
                )?;
            }
        }

        Ok(last_value.unwrap_or_default())
    } else {
        Err(format!("main file '{}' not found in source set", main_name))
    }
}

pub fn interpret(input: &str) -> Result<String, String> {
    use std::collections::HashMap;

    // Clear output buffer at the start
    clear_output_buffer();

    // Helper to evaluate an expression with access to the current environment.

    // Handle class definitions (syntactic sugar for functions that return this)
    if input.trim_start().starts_with("class ") {
        let s = input.trim();
        let transformed = statement::transform_class_to_fn(s);
        return interpret(&transformed);
    }

    // If input starts with a function definition followed by a call without
    // semicolons (e.g. "fn add(...) => { ... } add(3,4)") handle the definition
    // first then evaluate the tail expression.
    if input.trim_start().starts_with("fn ") {
        let s = input.trim();
        if let Some((_arrow_pos, _open_brace, end_idx)) = brace_utils::find_fn_arrow_and_braces(s) {
            let def_str = &s[..=end_idx];
            let tail = s[end_idx + 1..].trim();
            let mut env: HashMap<String, Var> = HashMap::new();
            let mut last_value: Option<String> = None;
            // register the function
            process_single_stmt(
                def_str,
                &mut env,
                &mut last_value,
                &local_eval_expr_with_env,
            )?;

            if tail.is_empty() {
                return Ok("".to_string());
            }
            // Handle tail that starts with semicolon (multiple statements)
            let tail_trimmed = tail.trim_start_matches(';').trim();
            if tail_trimmed.is_empty() {
                return Ok("".to_string());
            }
            // Process tail as statements
            let stmts = split_statements(tail_trimmed);
            for stmt in stmts {
                process_single_stmt(stmt, &mut env, &mut last_value, &local_eval_expr_with_env)?;
            }
            return Ok(wrap_with_output(last_value.unwrap_or_default()));
        }
    }

    // Handle a single top-level struct declaration without semicolons
    if input.trim_start().starts_with("struct ") {
        let s = input.trim();
        if let Some(open_idx) = s.find('{') {
            if let Some(close_idx) = brace_utils::find_matching_brace(s, open_idx) {
                let _def_str = &s[..=close_idx];
                let tail = s[close_idx + 1..].trim();
                let raw_name = s[6..open_idx]
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .trim();
                // strip generic params from struct name, e.g. Wrapper<T> -> Wrapper
                let name = if let Some(lt_pos) = raw_name.find('<') {
                    raw_name[..lt_pos].trim()
                } else {
                    raw_name
                };
                if !name.is_empty() {
                    let mut env: HashMap<String, Var> = HashMap::new();
                    let templ_val = s[open_idx + 1..close_idx].to_string();
                    env.insert(
                        format!("__struct__{}", name),
                        Var {
                            mutable: false,
                            value: templ_val,
                            suffix: Some("STRUCT".to_string()),
                            borrowed_mut: false,
                            declared_type: None,
                        },
                    );
                    if tail.is_empty() {
                        return Ok("".to_string());
                    }
                    // If the tail has semicolon-separated statements, execute them
                    // with the struct registered in the environment.
                    if tail.contains(';') {
                        let mut seq = tail;
                        if seq.starts_with('{') && seq.ends_with('}') {
                            seq = seq[1..seq.len() - 1].trim();
                        }
                        let stmts_raw = split_statements(seq);
                        let mut last_value: Option<String> = None;
                        for s in stmts_raw {
                            process_single_stmt(
                                s,
                                &mut env,
                                &mut last_value,
                                &local_eval_expr_with_env,
                            )?;
                        }
                        return Ok(last_value.unwrap_or_default());
                    }
                    let (val, _suf) = local_eval_expr_with_env(tail, &env)?;
                    return Ok(val);
                }
            }
        }
        return Err("invalid struct declaration".to_string());
    }

    // Check if input is an expression with braced blocks that should be evaluated
    // before treating it as statements (e.g., "{let x = 3; x} + {let x = 4; x}")
    // This must happen before the semicolon check, since blocks contain semicolons.
    if input.contains('{')
        && input.contains('}')
        && (input.contains('+') || input.contains('-') || input.contains('*'))
    {
        let env: HashMap<String, Var> = HashMap::new();
        if let Ok((val, suf)) = local_eval_expr_with_env(input, &env) {
            let result = if let Some(suffix) = suf {
                format!("{}{}", val, suffix)
            } else {
                val
            };
            return Ok(result);
        }
        // If it fails, fall through to other handlers
    }

    // Handle semicolon-separated statements
    if input.contains(';') {
        let mut seq = input.trim();
        if seq.starts_with('{') && seq.ends_with('}') {
            seq = seq[1..seq.len() - 1].trim();
        }

        let stmts_raw = split_statements(seq);
        let mut env: HashMap<String, Var> = HashMap::new();
        let mut last_value: Option<String> = None;
        let mut last_stmt: Option<String> = None;

        let mut i = 0usize;
        while i < stmts_raw.len() {
            if let Some(s) = stmts_raw.get(i) {
                // If this is an 'if' without an 'else' included, and the next statement
                // starts with 'else', merge them into a single handler string so
                // process_single_stmt/process_if_statement can parse them together.
                if s.trim_start().starts_with("if") && !s.contains("else") {
                    if let Some(next) = stmts_raw.get(i + 1) {
                        if next.trim_start().starts_with("else") {
                            let merged = format!("{} {}", s, next);
                            last_stmt = Some(merged.clone());
                            process_single_stmt(
                                merged.as_str(),
                                &mut env,
                                &mut last_value,
                                &local_eval_expr_with_env,
                            )?;
                            i += 2;
                            continue;
                        }
                    }
                }
                // Process normal statement
                last_stmt = Some(s.trim().to_string());
                process_single_stmt(s, &mut env, &mut last_value, &local_eval_expr_with_env)?;
            }
            i += 1;
        }

        // Call drop handlers for variables with declared types at scope exit
        let vars_to_drop: Vec<(String, String)> = crate::statement::collect_droppable_vars(&env);

        for (var_name, var_type) in vars_to_drop {
            let drop_handler_key = format!("__drop__{}", var_type);
            if let Some(handler_var) = env.get(&drop_handler_key) {
                // Get the variable value to pass to drop handler
                if let Some(var_to_drop) = env.get(&var_name) {
                    let var_value = var_to_drop.value.clone();
                    // Don't pass suffix - just pass the value itself
                    let call_text = format!("{}({})", handler_var.value, var_value,);

                    // Call the drop handler as a statement so environment updates propagate
                    let mut dummy_last_value: Option<String> = None;
                    let _ = process_single_stmt(
                        &call_text,
                        &mut env,
                        &mut dummy_last_value,
                        &local_eval_expr_with_env,
                    );
                }
            }
        }

        // After all drop handlers have been called, re-evaluate the last statement
        // in case it was a variable reference that was modified by a drop handler
        if let Some(stmt) = last_stmt {
            let stmt_trimmed = stmt.trim();
            // If the statement is a simple identifier, re-evaluate it to pick up updates from drop handlers
            if !stmt_trimmed.contains(' ')
                && !stmt_trimmed.contains('(')
                && !stmt_trimmed.contains('[')
            {
                if let Ok((new_val, _)) = local_eval_expr_with_env(stmt_trimmed, &env) {
                    last_value = Some(new_val);
                }
            }
        }

        return if let Some(value) = last_value {
            Ok(wrap_with_output(value))
        } else {
            Ok(wrap_with_output("".to_string()))
        };
    }

    if input.trim_start().starts_with("typeOf(") && input.trim_end().ends_with(')') {
        let inner = input.trim();
        let inner = &inner[7..inner.len() - 1];
        let inner = inner.trim();
        if inner.starts_with('\'') && inner.ends_with('\'') && inner.len() == 3 {
            return Ok("Char".to_string());
        }
        for sfx in SUFFIXES {
            if inner.ends_with(sfx) {
                return Ok(sfx.to_string());
            }
        }

        // interpret as expression: tokenize, detect suffix
        let tokens = tokenize_expr(inner)?;
        let seen_suffix = detect_suffix_from_tokens(&tokens)?;
        return Ok(seen_suffix.unwrap_or("").to_string());
    }

    // Handle a simple binary addition: "<lhs> + <rhs>" where both operands
    // are integers with the same type suffix (e.g. "1U8 + 2U8").
    if input.contains('+')
        || input.contains('-')
        || input.contains('*')
        || input.contains('(')
        || input.contains(')')
        || input.contains('<')
        || input.contains('>')
        || input.contains('=')
        || input.contains('!')
    {
        // Tokenize and detect suffix across tokens
        let tokens = tokenize_expr(input)?;
        let seen_suffix = detect_suffix_from_tokens(&tokens)?;

        let output = tokens_to_rpn(&tokens)?;

        let (value_out, _maybe_suffix) = evaluator::eval_output_with_suffix(&output, seen_suffix)?;
        return Ok(value_out);
    }

    // Handle char literals: 'a', 'Z', ' ', etc.
    if input.starts_with('\'') && input.ends_with('\'') && input.len() == 3 {
        return Ok(input.to_string());
    }

    // Handle Char suffix specially: aChar, ZChar, etc.
    if input.ends_with("Char") && input.len() > 4 {
        let char_part = &input[..input.len() - 4];
        if char_part.len() == 1 {
            if let Some(c) = char_part.chars().next() {
                if c.is_ascii() {
                    return Ok(input.to_string());
                }
            }
        }
    }

    for sfx in SUFFIXES {
        if input.ends_with(sfx) && sfx != "Char" {
            let pos = input.len() - sfx.len();
            if pos > 0
                && input
                    .as_bytes()
                    .get(pos - 1)
                    .map(|b| b.is_ascii_digit())
                    .unwrap_or(false)
            {
                // If suffix denotes an unsigned type, reject negative values
                // and ensure the numeric value fits the type's range.
                let numeric_part = &input[..pos];
                if sfx.starts_with('U') {
                    if numeric_part.starts_with('-') {
                        return Err("negative value for unsigned suffix".to_string());
                    }

                    let num_str = numeric_part.strip_prefix('+').unwrap_or(numeric_part);

                    // Parse as a wide unsigned and compare with the type max.
                    let parsed = num_str
                        .parse::<u128>()
                        .map_err(|_| "invalid numeric value for unsigned suffix".to_string())?;

                    check_unsigned_range(parsed, sfx)?;
                }

                return Ok(numeric_part.to_string());
            }
        }
    }

    // Accept plain integer literals (signed) as valid input
    let trimmed = input.trim();
    let num_candidate = trimmed.strip_prefix('+').unwrap_or(trimmed);
    if num_candidate.parse::<i128>().is_ok() {
        return Ok(trimmed.to_string());
    }

    // Explicitly accept boolean literals; otherwise treat unexpected input as an error
    if trimmed == "true" || trimmed == "false" {
        return Ok(trimmed.to_string());
    }

    Err("invalid input".to_string())
}
