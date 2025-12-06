mod brace_utils;
mod control;
mod eval_expr;
mod evaluator;
mod fn_utils;
mod parser;
mod pointer_utils;
mod range_check;
mod statement;

use parser::{detect_suffix_from_tokens, tokenize_expr, tokens_to_rpn};
use range_check::{check_unsigned_range, SUFFIXES};
use statement::{process_single_stmt, split_statements, Var};

pub fn interpret(input: &str) -> Result<String, String> {
    use std::collections::HashMap;

    // Helper to evaluate an expression with access to the current environment.
    fn eval_expr_with_env(
        expr: &str,
        env: &HashMap<String, Var>,
    ) -> Result<(String, Option<String>), String> {
        crate::eval_expr::eval_expr_with_env(expr, env)
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
            process_single_stmt(def_str, &mut env, &mut last_value, &eval_expr_with_env)?;

            if tail.is_empty() {
                return Ok("".to_string());
            }
            // evaluate the tail expression in the environment with the function registered
            let (val, _suf) = eval_expr_with_env(tail, &env)?;
            return Ok(val);
        }
    }

    // Handle a single top-level struct declaration without semicolons
    if input.trim_start().starts_with("struct ") {
        let s = input.trim();
        if let Some(open_idx) = s.find('{') {
            if let Some(close_idx) = brace_utils::find_matching_brace(s, open_idx) {
                let _def_str = &s[..=close_idx];
                let tail = s[close_idx + 1..].trim();
                let name = s[6..open_idx]
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .trim();
                if !name.is_empty() {
                    let mut env: HashMap<String, Var> = HashMap::new();
                    env.insert(
                        format!("__struct__{}", name),
                        Var {
                            mutable: false,
                            value: s[open_idx + 1..close_idx].to_string(),
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
                            process_single_stmt(s, &mut env, &mut last_value, &eval_expr_with_env)?;
                        }
                        return Ok(last_value.unwrap_or_default());
                    }
                    let (val, _suf) = eval_expr_with_env(tail, &env)?;
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
        if let Ok((val, suf)) = eval_expr_with_env(input, &env) {
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
                                &eval_expr_with_env,
                            )?;
                            i += 2;
                            continue;
                        }
                    }
                }
                // Process normal statement
                last_stmt = Some(s.trim().to_string());
                process_single_stmt(s, &mut env, &mut last_value, &eval_expr_with_env)?;
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
                        &eval_expr_with_env,
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
                if let Ok((new_val, _)) = eval_expr_with_env(stmt_trimmed, &env) {
                    last_value = Some(new_val);
                }
            }
        }

        return if let Some(value) = last_value {
            Ok(value)
        } else {
            Ok("".to_string())
        };
    }

    // `typeOf(<literal or expr>)` helper: return the suffix portion if present, e.g. typeOf(100U8) -> "U8"
    if input.trim_start().starts_with("typeOf(") && input.trim_end().ends_with(')') {
        let inner = input.trim();
        let inner = &inner[7..inner.len() - 1]; // between parentheses
        let inner = inner.trim();

        // fast-path: a single literal token
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
    {
        // Tokenize and detect suffix across tokens
        let tokens = tokenize_expr(input)?;
        let seen_suffix = detect_suffix_from_tokens(&tokens)?;

        let output = tokens_to_rpn(&tokens)?;

        let (value_out, _maybe_suffix) = evaluator::eval_output_with_suffix(&output, seen_suffix)?;
        return Ok(value_out);
    }
    for sfx in SUFFIXES {
        if input.ends_with(sfx) {
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
