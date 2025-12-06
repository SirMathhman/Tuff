use crate::control::{process_if_statement, process_while_statement, ControlContext};
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct Var {
    pub mutable: bool,
    pub suffix: Option<String>,
    pub value: String,
    pub borrowed_mut: bool,
    pub declared_type: Option<String>,
}

pub type ExprEvaluator<'a> =
    &'a dyn Fn(&str, &HashMap<String, Var>) -> Result<(String, Option<String>), String>;
pub struct StatementContext<'a> {
    pub env: &'a mut HashMap<String, Var>,
    pub eval_expr: ExprEvaluator<'a>,
    pub last_value: &'a mut Option<(String, Option<String>)>,
}
mod assignment;
mod block;
mod declaration;
pub mod helpers;
mod mut_capture;
pub mod top;
pub use block::{eval_block_expr, eval_block_expr_mut, split_statements};
pub use helpers::{
    collect_droppable_vars, parse_fn_literal, resolve_fn_or_eval_rhs, transform_class_to_fn,
};
use mut_capture::try_call_with_mut_captures;
// try_copy_fn_definition moved to helpers.rs

// helpers moved to helpers.rs

fn run_block_stmt(s: &str, ctx: &mut StatementContext) -> Result<(), String> {
    let s = s.trim();

    if s.starts_with('{') && s.ends_with('}') {
        let inner = s[1..s.len() - 1].trim();
        let (val, suf) = eval_block_expr(inner, ctx.env, ctx.eval_expr)?;
        *ctx.last_value = Some((val, suf));
        return Ok(());
    }

    if s.starts_with("if") {
        let mut tmp_last: Option<String> = None;
        let mut ctrl_ctx = ControlContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: &mut tmp_last,
        };
        process_if_statement(s, &mut ctrl_ctx)?;
        return Ok(());
    }

    if s.starts_with("while") {
        let mut tmp_last: Option<String> = None;
        let mut ctrl_ctx = ControlContext {
            env: ctx.env,
            eval_expr: ctx.eval_expr,
            last_value: &mut tmp_last,
        };
        process_while_statement(s, &mut ctrl_ctx)?;
        return Ok(());
    }

    if s.starts_with("fn ") && s.contains('{') && !s.contains("=>") {
        // Only error if it's a full function definition with braces (not a function literal)
        // Function literals like `fn () => 100` should be allowed as expressions
        return Err("functions cannot be defined inside blocks".to_string());
    }

    // Handle named function literals inside blocks: store them in the environment
    // and return the function value so it can be used as an expression
    if s.starts_with("fn ") && s.contains("=>") {
        if let Some((fn_name, captures_str, params_str, return_type, body)) =
            helpers::parse_fn_literal(s)
        {
            // Store function with format: params|return_type|body
            let fn_value = format!("{}|{}|{}", params_str, return_type, body);

            if !fn_name.is_empty() {
                // If no explicit captures provided, detect referenced variables automatically
                let final_captures_str = if captures_str.is_empty() {
                    top::detect_captures(&body, &params_str, ctx.env)
                } else {
                    captures_str
                };

                helpers::insert_named_fn(ctx.env, &fn_name, &fn_value, Some(&final_captures_str));
            }
            // Return the function value so it can be used as an expression result
            *ctx.last_value = Some((fn_value, Some("FN".to_string())));
            return Ok(());
        }
    }

    if let Some(stripped) = s.strip_prefix("return ") {
        // Handle return statement: evaluate expression and signal early exit
        let expr = stripped.trim();
        let expr = if let Some(stripped) = expr.strip_suffix(';') {
            stripped.trim()
        } else {
            expr
        };
        let (value, suf) = (ctx.eval_expr)(expr, ctx.env)?;
        let return_signal = if let Some(suffix) = suf {
            format!("__RETURN__:{}|{}", value, suffix)
        } else {
            format!("__RETURN__:{}", value)
        };
        return Err(return_signal);
    }

    if s.starts_with("let ") {
        process_declaration(s, ctx)?;
        return Ok(());
    }

    // Don't treat arrow functions as assignments (=> is not an assignment operator)
    if s.contains('=') && !s.contains("=>") && !s.starts_with("let ") {
        process_assignment(s, ctx)?;
        return Ok(());
    }

    // function calls with mutable captures handled specially below
    if let Some((value, suf)) = try_call_with_mut_captures(s, ctx)? {
        *ctx.last_value = Some((value, suf));
        return Ok(());
    }

    let (value, suf) = (ctx.eval_expr)(s, ctx.env)?;
    *ctx.last_value = Some((value, suf));
    Ok(())
}

// helper control logic in control.rs

fn eval_rhs(
    rhs: &str,
    env: &HashMap<String, Var>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(String, Option<String>), String> {
    if rhs.starts_with('{') && rhs.ends_with('}') {
        eval_block_expr(rhs[1..rhs.len() - 1].trim(), env, eval_expr_with_env)
    } else {
        eval_expr_with_env(rhs, env)
    }
}

#[allow(clippy::too_many_arguments)]
fn check_declared_compat(
    env: &HashMap<String, Var>,
    declared: &str,
    expr_suffix: Option<&String>,
    value: &str,
) -> Result<(), String> {
    if let Some(sfx) = expr_suffix {
        if sfx != declared {
            if let Some(resolved) = crate::statement::validate::resolve_alias(env, declared) {
                if sfx != resolved {
                    return Err("type suffix mismatch on assignment".to_string());
                }
            } else {
                return Err("type suffix mismatch on assignment".to_string());
            }
        }
    }
    crate::statement::validate::validate_type(env, value, declared)?;
    Ok(())
}

mod ptr;
pub use ptr::{apply_assignment_to_var, assign_ptr_to_existing_var, parse_address_of};

fn process_declaration(s: &str, ctx: &mut StatementContext) -> Result<(), String> {
    declaration::process_declaration(s, ctx)
}

fn process_assignment(s: &str, ctx: &mut StatementContext) -> Result<(), String> {
    assignment::process_assignment(s, ctx)
}

mod validate; // validation helpers
/// Context for top-level statement processing
pub struct TopStmtContext<'a> {
    pub env: &'a mut HashMap<String, Var>,
    pub eval_expr: ExprEvaluator<'a>,
    pub last_value: &'a mut Option<String>,
}
pub use top::process_single_stmt;

// Return a list of (variable_name, declared_type) for variables that have a declared type
// collect_droppable_vars moved to helpers.rs and re-exported
