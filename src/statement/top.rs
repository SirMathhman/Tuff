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
        // Parse and store function definition. Support both braced and expression bodies.
        let mut arrow_pos_opt: Option<usize> = None;
        let mut open_brace: Option<usize> = None;
        let mut close_brace: Option<usize> = None;

        if let Some((arrow_pos, ob, cb)) = crate::brace_utils::find_fn_arrow_and_braces(s) {
            arrow_pos_opt = Some(arrow_pos);
            open_brace = Some(ob);
            close_brace = Some(cb);
        } else if let Some(a) = s.find("=>") {
            arrow_pos_opt = Some(a);
        }

        if let Some(arrow_pos) = arrow_pos_opt {
            let sig_str = &s[3..arrow_pos].trim();
            if let Some(paren_idx) = sig_str.find('(') {
                if let Some(close_paren_idx) = sig_str.find(')') {
                    let name = sig_str[..paren_idx].trim().to_string();
                    let params_str = sig_str[paren_idx + 1..close_paren_idx].to_string();
                    let return_type = sig_str[close_paren_idx + 1..].trim();
                    let return_type = return_type
                        .strip_prefix(':')
                        .unwrap_or(return_type)
                        .trim()
                        .to_string();

                    let body = if let (Some(ob), Some(cb)) = (open_brace, close_brace) {
                        s[ob + 1..cb].to_string()
                    } else {
                        let mut b = s[arrow_pos + 2..].trim().to_string();
                        if b.ends_with(';') {
                            b.pop();
                            b = b.trim().to_string();
                        }
                        b
                    };

                    let fn_key = format!("__fn__{}", name);
                    let fn_value = format!("{}|{}|{}", params_str, return_type, body);
                    ctx.env.insert(
                        fn_key,
                        Var {
                            mutable: false,
                            value: fn_value,
                            suffix: Some("FN".to_string()),
                            borrowed_mut: false,
                        },
                    );
                }
            }
        }
        *ctx.last_value = None;
        return Ok(());
    }

    if s.starts_with("type ") {
        // top-level type alias declarations: `type Name = BaseType`
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

        let key = format!("__alias__{}", name);
        if ctx.env.contains_key(name) || ctx.env.contains_key(&key) {
            return Err("duplicate declaration".to_string());
        }

        ctx.env.insert(
            key,
            super::Var {
                mutable: false,
                suffix: Some("ALIAS".to_string()),
                value: base.to_string(),
                borrowed_mut: false,
            },
        );
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
