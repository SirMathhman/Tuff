use crate::range_check::{check_signed_range, check_unsigned_range};

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

pub fn apply_unsigned_op(total: u128, rhs: u128, op: &char, suffix: &str) -> Result<u128, String> {
    let result = match op {
        '+' => total
            .checked_add(rhs)
            .ok_or_else(|| "overflow".to_string())?,
        '-' => {
            if total < rhs {
                return Err("value out of range for unsigned after subtraction".to_string());
            }
            total
                .checked_sub(rhs)
                .ok_or_else(|| "overflow".to_string())?
        }
        '*' => total
            .checked_mul(rhs)
            .ok_or_else(|| "overflow".to_string())?,
        _ => return Err("invalid operator".to_string()),
    };
    check_unsigned_range(result, suffix)?;
    Ok(result)
}

pub fn apply_signed_op(total: i128, rhs: i128, op: &char, suffix: &str) -> Result<i128, String> {
    let result = match op {
        '+' => total
            .checked_add(rhs)
            .ok_or_else(|| "overflow".to_string())?,
        '-' => total
            .checked_sub(rhs)
            .ok_or_else(|| "overflow".to_string())?,
        '*' => total
            .checked_mul(rhs)
            .ok_or_else(|| "overflow".to_string())?,
        _ => return Err("invalid operator".to_string()),
    };
    check_signed_range(result, suffix)?;
    Ok(result)
}

pub fn eval_rpn_generic<T, P, A>(
    output: &[String],
    suffix: &str,
    parse: P,
    apply: A,
) -> Result<T, String>
where
    P: Fn(&str, &str) -> Result<T, String>,
    A: Fn(T, T, &char, &str) -> Result<T, String>,
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
            let res = apply(lhs, rhs, &op_char, suffix)?;
            stack.push(res);
        } else {
            let v = parse(tok, suffix)?;
            stack.push(v);
        }
    }
    if stack.len() != 1 {
        return Err("invalid expression".to_string());
    }
    stack.pop().ok_or_else(|| "invalid expression".to_string())
}
