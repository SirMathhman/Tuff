use crate::control::{process_if_statement, process_while_statement, ControlContext};

use super::{
    process_assignment, process_declaration, split_statements, ExprEvaluator, StatementContext, Var,
};
use std::collections::HashMap;

#[allow(clippy::too_many_arguments)]
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
        // Parse and store function definition
        // Format: fn name(param1: Type1, param2: Type2) : ReturnType => { body }
        if let Some((arrow_pos, _open_brace, end_idx)) =
            crate::brace_utils::find_fn_arrow_and_braces(s)
        {
            // extract function name from "fn name(...)"
            let sig_str = &s[3..arrow_pos].trim();
            if let Some(paren_idx) = sig_str.find('(') {
                let name = sig_str[..paren_idx].trim().to_string();

                // extract params and return type
                if let Some(close_paren_idx) = sig_str.find(')') {
                    let params_str = sig_str[paren_idx + 1..close_paren_idx].to_string();
                    let return_type = sig_str[close_paren_idx + 1..].trim();
                    let return_type = return_type
                        .strip_prefix(':')
                        .unwrap_or(return_type)
                        .trim()
                        .to_string();

                    // extract body
                    let body = s[_open_brace + 1..end_idx].to_string();

                    // store as __fn__<name> with format: "params|return_type|body"
                    let fn_key = format!("__fn__{}", name);
                    let fn_value = format!("{}|{}|{}", params_str, return_type, body);
                    ctx.env.insert(
                        fn_key,
                        Var {
                            mutable: false,
                            value: fn_value,
                            suffix: Some("FN".to_string()),
                        },
                    );
                }
            }
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

    let (value, _suffix) = (ctx.eval_expr)(s, ctx.env)?;
    *ctx.last_value = Some(value);
    Ok(())
}
