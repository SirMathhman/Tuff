use crate::range_check::{check_signed_range, check_unsigned_range};

/// Context for arithmetic/comparison operations
#[derive(Clone)]
pub struct OpContext {
    pub suffix: String,
}

/// Unsigned operation parameters
pub struct UnsignedOp {
    pub ctx: OpContext,
    pub lhs: u128,
    pub rhs: u128,
}

/// Signed operation parameters  
pub struct SignedOp {
    pub ctx: OpContext,
    pub lhs: i128,
    pub rhs: i128,
}

pub fn parse_unsigned_token(token: &str, suffix: &str) -> Result<u128, String> {
    let numeric = if let Some(stripped) = token.strip_suffix(suffix) {
        stripped
    } else {
        token
    };
    if numeric.starts_with('-') {
        return Err("negative value for unsigned suffix".to_string());
    }
    let v = numeric
        .strip_prefix('+')
        .unwrap_or(numeric)
        .parse::<u128>()
        .map_err(|_| "invalid numeric value".to_string())?;
    check_unsigned_range(v, suffix)?;
    Ok(v)
}

pub fn parse_signed_token(token: &str, suffix: &str) -> Result<i128, String> {
    let numeric = if let Some(stripped) = token.strip_suffix(suffix) {
        stripped
    } else {
        token
    };
    let v = numeric
        .strip_prefix('+')
        .unwrap_or(numeric)
        .parse::<i128>()
        .map_err(|_| "invalid numeric value".to_string())?;
    check_signed_range(v, suffix)?;
    Ok(v)
}

pub fn apply_unsigned_op(op: UnsignedOp, op_char: &char) -> Result<u128, String> {
    let result = match op_char {
        '+' => op
            .lhs
            .checked_add(op.rhs)
            .ok_or_else(|| "overflow".to_string())?,
        '-' => {
            if op.lhs < op.rhs {
                return Err("value out of range for unsigned after subtraction".to_string());
            }
            op.lhs
                .checked_sub(op.rhs)
                .ok_or_else(|| "overflow".to_string())?
        }
        '*' => op
            .lhs
            .checked_mul(op.rhs)
            .ok_or_else(|| "overflow".to_string())?,
        _ => return Err("invalid operator".to_string()),
    };
    check_unsigned_range(result, &op.ctx.suffix)?;
    Ok(result)
}

pub fn apply_signed_op(op: SignedOp, op_char: &char) -> Result<i128, String> {
    let result = match op_char {
        '+' => op
            .lhs
            .checked_add(op.rhs)
            .ok_or_else(|| "overflow".to_string())?,
        '-' => op
            .lhs
            .checked_sub(op.rhs)
            .ok_or_else(|| "overflow".to_string())?,
        '*' => op
            .lhs
            .checked_mul(op.rhs)
            .ok_or_else(|| "overflow".to_string())?,
        '>' => {
            if op.lhs > op.rhs {
                op.lhs
            } else {
                return Err("condition false".to_string());
            }
        }
        '<' => {
            if op.lhs < op.rhs {
                op.lhs
            } else {
                return Err("condition false".to_string());
            }
        }
        '!' => return Err("invalid operator".to_string()),
        '=' => return Err("invalid operator".to_string()),
        _ => return Err("invalid operator".to_string()),
    };
    check_signed_range(result, &op.ctx.suffix)?;
    Ok(result)
}

/// Context for RPN evaluation with callbacks
pub struct RpnContext<T, P, A>
where
    P: Fn(&str) -> Result<T, String>,
    A: Fn(T, T, &char) -> Result<T, String>,
    T: Copy,
{
    pub parse: P,
    pub apply: A,
}

pub fn eval_rpn_generic<T, P, A>(output: &[String], ctx: RpnContext<T, P, A>) -> Result<T, String>
where
    P: Fn(&str) -> Result<T, String>,
    A: Fn(T, T, &char) -> Result<T, String>,
    T: Copy,
{
    let mut stack: Vec<T> = Vec::new();
    for tok in output {
        if tok == "+" || tok == "-" || tok == "*" {
            let rhs = stack
                .pop()
                .ok_or_else(|| "invalid expression".to_string())?;
            let lhs = stack
                .pop()
                .ok_or_else(|| "invalid expression".to_string())?;
            let op_char = tok
                .chars()
                .next()
                .ok_or_else(|| "invalid operator token".to_string())?;
            let res = (ctx.apply)(lhs, rhs, &op_char)?;
            stack.push(res);
        } else {
            let v = (ctx.parse)(tok)?;
            stack.push(v);
        }
    }
    if stack.len() != 1 {
        return Err("invalid expression".to_string());
    }
    stack.pop().ok_or_else(|| "invalid expression".to_string())
}

pub fn parse_plain_i128(token: &str, _suffix: &str) -> Result<i128, String> {
    let num = token.strip_prefix('+').unwrap_or(token);
    num.parse::<i128>()
        .map_err(|_| "invalid numeric value".to_string())
}

pub fn eval_output_with_suffix(
    output: &[String],
    seen_suffix: Option<&str>,
) -> Result<(String, Option<String>), String> {
    // If there are comparison operators in the RPN, evaluate to boolean.
    let has_cmp = output
        .iter()
        .any(|t| matches!(t.as_str(), "<" | ">" | "<=" | ">=" | "==" | "!="));
    if has_cmp {
        // Generic helper to evaluate comparison expressions with a parse function
        fn eval_cmp_generic<T, F>(output: &[String], mut parse: F) -> Result<String, String>
        where
            F: FnMut(&str) -> Result<T, String>,
            T: Copy + PartialOrd + Eq,
        {
            let mut stack: Vec<T> = Vec::new();
            for tok in output {
                match tok.as_str() {
                    "<" | ">" | "<=" | ">=" | "==" | "!=" => {
                        let rhs = stack
                            .pop()
                            .ok_or_else(|| "invalid expression".to_string())?;
                        let lhs = stack
                            .pop()
                            .ok_or_else(|| "invalid expression".to_string())?;
                        let res = match tok.as_str() {
                            "<" => lhs < rhs,
                            ">" => lhs > rhs,
                            "<=" => lhs <= rhs,
                            ">=" => lhs >= rhs,
                            "==" => lhs == rhs,
                            "!=" => lhs != rhs,
                            _ => return Err("invalid operator".to_string()),
                        };
                        return Ok(if res { "true" } else { "false" }.to_string());
                    }
                    other => {
                        let v = parse(other)?;
                        stack.push(v);
                    }
                }
            }
            Err("invalid comparison expression".to_string())
        }

        if let Some(suffix) = seen_suffix {
            if suffix.starts_with('U') {
                let res = eval_cmp_generic(output, |t| parse_unsigned_token(t, suffix))?;
                return Ok((res, None));
            } else {
                let res = eval_cmp_generic(output, |t| parse_signed_token(t, suffix))?;
                return Ok((res, None));
            }
        } else {
            let res = eval_cmp_generic(output, |t| parse_plain_i128(t, ""))?;
            return Ok((res, None));
        }
    }

    // Fallback: arithmetic evaluation
    if let Some(suffix) = seen_suffix {
        let unsigned = suffix.starts_with('U');
        if unsigned {
            let res = eval_rpn_unsigned(output, suffix)?;
            Ok((res.to_string(), Some(suffix.to_string())))
        } else {
            let res = eval_rpn_signed(output, suffix)?;
            Ok((res.to_string(), Some(suffix.to_string())))
        }
    } else {
        let res = eval_rpn_plain(output)?;
        Ok((res.to_string(), None))
    }
}

fn eval_rpn_unsigned(output: &[String], suffix: &str) -> Result<u128, String> {
    let ctx = OpContext {
        suffix: suffix.to_string(),
    };
    let rpn_ctx = RpnContext {
        parse: |t| parse_unsigned_token(t, suffix),
        apply: |lhs, rhs, op| {
            let unsigned_op = UnsignedOp {
                ctx: ctx.clone(),
                lhs,
                rhs,
            };
            apply_unsigned_op(unsigned_op, op)
        },
    };
    eval_rpn_generic::<u128, _, _>(output, rpn_ctx)
}

fn eval_rpn_signed(output: &[String], suffix: &str) -> Result<i128, String> {
    let ctx = OpContext {
        suffix: suffix.to_string(),
    };
    let is_signed = true; // marker for signed operation
    let rpn_ctx = RpnContext {
        parse: |t| parse_signed_token(t, suffix),
        apply: |lhs, rhs, op| {
            let signed_op = SignedOp {
                ctx: ctx.clone(),
                lhs,
                rhs,
            };
            apply_signed_op(signed_op, op)
        },
    };
    let _ = is_signed; // use marker
    eval_rpn_generic::<i128, _, _>(output, rpn_ctx)
}

fn eval_rpn_plain(output: &[String]) -> Result<i128, String> {
    let ctx = OpContext {
        suffix: "".to_string(),
    };
    let rpn_ctx = RpnContext {
        parse: |t| parse_plain_i128(t, ""),
        apply: |lhs, rhs, op| {
            let signed_op = SignedOp {
                ctx: ctx.clone(),
                lhs,
                rhs,
            };
            apply_signed_op(signed_op, op)
        },
    };
    eval_rpn_generic::<i128, _, _>(output, rpn_ctx)
}
