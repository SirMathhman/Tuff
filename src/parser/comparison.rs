use crate::variables::Environment;

pub(super) fn parse_comparison_expression(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i32, String> {
    let mut result = super::parse_addition_expression(input, pos, env)?;

    while *pos < input.len() {
        let trimmed = input[*pos..].trim_start();
        let op = if trimmed.starts_with("==") {
            Some("==")
        } else if trimmed.starts_with("!=") {
            Some("!=")
        } else if trimmed.starts_with("<=") {
            Some("<=")
        } else if trimmed.starts_with(">=") {
            Some(">=")
        } else if trimmed.starts_with('<') {
            Some("<")
        } else if trimmed.starts_with('>') {
            Some(">")
        } else {
            None
        };

        if let Some(op_str) = op {
            *pos += input[*pos..].len() - trimmed.len() + op_str.len();
            let rhs = super::parse_addition_expression(input, pos, env)?;
            result = match op_str {
                "==" => i32::from(result == rhs),
                "!=" => i32::from(result != rhs),
                "<" => i32::from(result < rhs),
                ">" => i32::from(result > rhs),
                "<=" => i32::from(result <= rhs),
                ">=" => i32::from(result >= rhs),
                _ => return Err(format!("Unknown comparison operator: {}", op_str)),
            };
        } else {
            break;
        }
    }

    Ok(result)
}
