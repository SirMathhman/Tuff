use super::{ExprEvaluator, StatementContext, Var};
use std::collections::HashMap;

pub fn split_statements(seq: &str) -> Vec<&str> {
    let mut stmts: Vec<&str> = Vec::new();
    let mut start = 0usize;
    let mut depth: i32 = 0;
    for (i, ch) in seq.char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => depth = depth.saturating_sub(1),
            ';' if depth == 0 => {
                let stmt = seq[start..i].trim();
                if !stmt.is_empty() {
                    stmts.push(stmt);
                }
                start = i + 1;
            }
            _ => {}
        }
    }
    let stmt = seq[start..].trim();
    if !stmt.is_empty() {
        stmts.push(stmt);
    }
    stmts
}

pub fn eval_block_expr(
    block_text: &str,
    env: &HashMap<String, Var>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(String, Option<String>), String> {
    let mut local_env = env.clone();
    eval_block_expr_mut(block_text, &mut local_env, eval_expr_with_env)
}

/// Version of eval_block_expr that takes a mutable environment reference.
/// This allows mutations within the block to persist.
pub fn eval_block_expr_mut(
    block_text: &str,
    local_env: &mut HashMap<String, Var>,
    eval_expr_with_env: ExprEvaluator,
) -> Result<(String, Option<String>), String> {
    let stmts = split_statements(block_text.trim());
    let mut last_value: Option<(String, Option<String>)> = None;

    for st in stmts {
        let mut ctx = StatementContext {
            env: local_env,
            eval_expr: eval_expr_with_env,
            last_value: &mut last_value,
        };
        match super::run_block_stmt(st, &mut ctx) {
            Ok(()) => {}
            Err(e) if e.starts_with("__RETURN__:") => {
                // Early return from function: extract the return value
                let return_val = e.strip_prefix("__RETURN__:").unwrap_or("");
                // Parse: "__RETURN__:value|suffix" or "__RETURN__:value"
                if let Some(pipe_idx) = return_val.find('|') {
                    let val = return_val[..pipe_idx].to_string();
                    let suf = Some(return_val[pipe_idx + 1..].to_string());
                    return Ok((val, suf));
                } else {
                    return Ok((return_val.to_string(), None));
                }
            }
            Err(e) => return Err(e),
        }
    }

    if let Some((v, suf)) = last_value {
        Ok((v, suf))
    } else {
        Ok(("".to_string(), None))
    }
}
