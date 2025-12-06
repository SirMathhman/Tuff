use crate::control::{process_if_statement, process_while_statement, ControlContext};

use super::mut_capture::try_call_with_mut_captures_top;
use super::{
    process_assignment, process_declaration, split_statements, ExprEvaluator, StatementContext, Var,
};
use std::collections::HashMap;

/// Detect variables referenced in function body that should be captured.
/// Returns a comma-separated list of captures like "&x, &mut y"
pub fn detect_captures(body: &str, params_str: &str, env: &HashMap<String, Var>) -> String {
    // Extract parameter names to exclude them from captures
    let param_names: std::collections::HashSet<String> = params_str
        .split(',')
        .filter_map(|p| {
            let name = p.split(':').next()?.trim();
            if name.is_empty() {
                None
            } else {
                Some(name.to_string())
            }
        })
        .collect();

    // Track which variables are captured and whether they're mutated
    let mut captures: std::collections::HashMap<String, bool> = std::collections::HashMap::new();
    let mut current_ident = String::new();
    let chars_vec: Vec<char> = body.chars().collect();

    for i in 0..chars_vec.len() {
        let ch = *chars_vec.get(i).unwrap_or(&' ');

        if ch.is_alphanumeric() || ch == '_' {
            current_ident.push(ch);
        } else if !current_ident.is_empty() {
            // Check if this identifier is a variable in env and not a parameter
            if !param_names.contains(&current_ident)
                && env.contains_key(&current_ident)
                && !current_ident.starts_with("__")
            {
                // Check if this is an assignment (var = ...)
                let is_mutation = {
                    let mut j = i;
                    // Skip whitespace
                    while j < chars_vec.len() && chars_vec.get(j).is_some_and(|c| c.is_whitespace())
                    {
                        j += 1;
                    }
                    // Check if next char is '=' but not '==' or '=>'
                    if chars_vec.get(j) == Some(&'=') {
                        j += 1;
                        // Not '==' and not '=>'
                        chars_vec.get(j) != Some(&'=') && chars_vec.get(j) != Some(&'>')
                    } else {
                        false
                    }
                };

                // Add or update the capture
                captures
                    .entry(current_ident.clone())
                    .and_modify(|is_mut| *is_mut = *is_mut || is_mutation)
                    .or_insert(is_mutation);
            }
            current_ident.clear();
        }
    }

    // Check last identifier
    if !current_ident.is_empty()
        && !param_names.contains(&current_ident)
        && env.contains_key(&current_ident)
        && !current_ident.starts_with("__")
    {
        captures.entry(current_ident).or_insert(false);
    }

    // Format as "&x, &mut y, &z"
    let mut capture_list: Vec<String> = captures
        .iter()
        .map(|(var, is_mut)| {
            if *is_mut {
                format!("&mut {}", var)
            } else {
                format!("&{}", var)
            }
        })
        .collect();

    capture_list.sort();
    capture_list.join(", ")
}

#[allow(clippy::too_many_arguments)]
pub fn process_single_stmt(
    stmt_text: &str,
    env: &mut HashMap<String, Var>,
    last_value: &mut Option<String>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(), String> {
    let mut ctx = super::TopStmtContext {
        env,
        eval_expr: eval_expr_with_env,
        last_value,
    };
    process_single_stmt_internal(stmt_text, &mut ctx)
}

fn process_single_stmt_internal(
    stmt_text: &str,
    ctx: &mut super::TopStmtContext,
) -> Result<(), String> {
    let s = stmt_text.trim();

    if s.starts_with('{') && s.ends_with('}') {
        let inner = s[1..s.len() - 1].trim();
        if inner.contains(';') {
            for inner_stmt in split_statements(inner) {
                process_single_stmt_internal(inner_stmt, ctx)?;
            }
            return Ok(());
        } else {
            let (value, _suffix) = (ctx.eval_expr)(inner, ctx.env)?;
            *ctx.last_value = Some(value);
            return Ok(());
        }
    }

    if s.starts_with("if") {
        let mut ctrl_ctx = ControlContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: ctx.last_value,
        };
        process_if_statement(s, &mut ctrl_ctx)?;
        return Ok(());
    }

    if s.starts_with("while") {
        let mut ctrl_ctx = ControlContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: ctx.last_value,
        };
        process_while_statement(s, &mut ctrl_ctx)?;
        return Ok(());
    }

    if s.starts_with("fn ") {
        // Parse and store function definition. Support both braced and expression bodies.

        if let Some((fn_name, captures_str, params_str, return_type, body)) =
            crate::statement::parse_fn_literal(s)
        {
            if !fn_name.is_empty() {
                // If no explicit captures provided, detect referenced variables automatically
                let final_captures_str = if captures_str.is_empty() {
                    detect_captures(&body, &params_str, ctx.env)
                } else {
                    captures_str
                };

                // Store function with format: params|return_type|body
                let fn_key = format!("__fn__{}", fn_name);
                let fn_value = format!("{}|{}|{}", params_str, return_type, body);
                ctx.env.insert(
                    fn_key.clone(),
                    Var {
                        mutable: false,
                        value: fn_value,
                        suffix: Some("FN".to_string()),
                        borrowed_mut: false,
                        declared_type: None,
                    },
                );

                if !final_captures_str.is_empty() {
                    let captures_key = format!("__captures__{}", fn_name);
                    ctx.env.insert(
                        captures_key,
                        Var {
                            mutable: false,
                            value: final_captures_str,
                            suffix: Some("CAPTURES".to_string()),
                            borrowed_mut: false,
                            declared_type: None,
                        },
                    );
                }
            }
        }
        *ctx.last_value = None;
        return Ok(());
    }

    if s.starts_with("type ") {
        // top-level type alias declarations: `type Name = BaseType` or `type Name = BaseType!drop`
        let rest = s[4..].trim();
        let mut parts = rest.splitn(2, '=');
        let name = parts
            .next()
            .ok_or_else(|| "invalid type declaration".to_string())?
            .trim();
        let base = parts
            .next()
            .ok_or_else(|| "invalid type declaration".to_string())?
            .trim();
        if name.is_empty() || base.is_empty() {
            return Err("invalid type declaration".to_string());
        }

        // Check for drop handler marker: BaseType!drop
        let (base_type, drop_fn) = if let Some(exclaim_pos) = base.find('!') {
            let typ = base[..exclaim_pos].trim();
            let handler = base[exclaim_pos + 1..].trim();
            (typ.to_string(), Some(handler.to_string()))
        } else {
            (base.to_string(), None)
        };

        let key = format!("__alias__{}", name);
        if ctx.env.contains_key(name) || ctx.env.contains_key(&key) {
            return Err("duplicate declaration".to_string());
        }

        ctx.env.insert(
            key,
            super::Var {
                mutable: false,
                suffix: Some("ALIAS".to_string()),
                value: base_type,
                borrowed_mut: false,
                declared_type: None,
            },
        );

        // Store drop handler if present
        if let Some(handler) = drop_fn {
            let drop_key = format!("__drop__{}", name);
            ctx.env.insert(
                drop_key,
                super::Var {
                    mutable: false,
                    suffix: Some("DROP".to_string()),
                    value: handler,
                    borrowed_mut: false,
                    declared_type: None,
                },
            );
        }

        *ctx.last_value = None;
        return Ok(());
    }

    // No special handling for `struct` inside blocks; top-level handler in lib.rs

    if s.starts_with("let ") {
        let mut block_last: Option<(String, Option<String>)> = None;
        let is_decl = true; // marker
        let mut stmt_ctx = StatementContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: &mut block_last,
        };
        let _ = is_decl;
        process_declaration(s, &mut stmt_ctx)?;
        *ctx.last_value = None;
        return Ok(());
    }

    if s.contains('=') && !s.starts_with("let ") {
        let mut block_last: Option<(String, Option<String>)> = None;
        let is_assign = true; // marker
        let mut stmt_ctx = StatementContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: &mut block_last,
        };
        let _ = is_assign;
        process_assignment(s, &mut stmt_ctx)?;
        *ctx.last_value = None;
        return Ok(());
    }

    // Check for function calls with mutable captures - handle specially since we have &mut env
    if let Some((value, _suf)) = try_call_with_mut_captures_top(s, ctx)? {
        *ctx.last_value = Some(value);
        return Ok(());
    }

    let (value, _suffix) = (ctx.eval_expr)(s, ctx.env)?;
    *ctx.last_value = Some(value);
    Ok(())
}
