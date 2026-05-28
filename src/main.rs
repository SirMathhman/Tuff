use std::io::{self, BufRead};

fn main() {
    println!("Tuff REPL - type 'quit' to exit");
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        match line {
            Ok(input) => {
                if input.trim().eq_ignore_ascii_case("quit") {
                    break;
                }
                if input.is_empty() {
                    continue;
                }
                match execute_tuff(&input) {
                    Ok(result) => println!("=> {}", result),
                    Err(e) => println!("Error: {}", e),
                }
            }
            Err(_) => {
                eprintln!("Failed to read line");
                break;
            }
        }
    }
}

fn execute_tuff(input: &str) -> Result<u64, &'static str> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }

    // Tokenize into values and operators (+, -, *, /)
    // A `-` at the start or immediately after another operator is a unary minus (part of the value)
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut prev_was_operator = true;

    for ch in trimmed.chars() {
        if ch == '+' || ch == '-' || ch == '*' || ch == '/' || ch == '%' {
            // `-` at start or after operator is unary, keep it with the value
            if ch == '-' && prev_was_operator {
                current.push(ch);
                continue;
            }
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            tokens.push(format!("{}", ch));
            prev_was_operator = true;
        } else if ch.is_whitespace() {
            // Skip whitespace
            continue;
        } else {
            current.push(ch);
            prev_was_operator = false;
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }

    let mut operands: Vec<i64> = Vec::new();
    let mut ops: Vec<char> = Vec::new();

    for token in &tokens {
        match token.as_str() {
            "+" | "-" | "*" | "/" | "%" => ops.push(token.chars().next().unwrap()),
            _ => operands.push(evaluate_value(token)? as i64),
        }
    }

    if operands.is_empty() {
        return Ok(0);
    }

    if ops.is_empty() {
        let val = operands[0];
        if val < 0 {
            return Err("result underflows below zero");
        }
        return Ok(val as u64);
    }

    // Pass 1: Evaluate multiplications and divisions (higher precedence)
    let mut result_ops: Vec<i64> = vec![operands[0]];
    let mut result_op_chars: Vec<char> = Vec::new();

    for (i, op) in ops.iter().enumerate() {
        match *op {
            '*' => {
                let last = result_ops.pop().unwrap();
                result_ops.push(last * operands[i + 1]);
            }
            '/' => {
                let last = result_ops.pop().unwrap();
                if operands[i + 1] == 0 {
                    return Err("division by zero");
                }
                result_ops.push(last / operands[i + 1]);
            }
            '%' => {
                let last = result_ops.pop().unwrap();
                if operands[i + 1] == 0 {
                    return Err("modulo by zero");
                }
                result_ops.push(last % operands[i + 1]);
            }
            _ => {
                result_op_chars.push(*op);
                result_ops.push(operands[i + 1]);
            }
        }
    }

    // Pass 2: Evaluate additions and subtractions (left to right)
    let mut final_result = result_ops[0];
    for (i, op) in result_op_chars.iter().enumerate() {
        match op {
            '+' => final_result += result_ops[i + 1],
            '-' => final_result -= result_ops[i + 1],
            _ => unreachable!(),
        }
    }

    if final_result < 0 {
        return Err("result underflows below zero");
    }
    Ok(final_result as u64)
}

/// Evaluate a single TUIR value or return 0 for unrecognized input.
fn evaluate_value(input: &str) -> Result<u64, &'static str> {
    if let Some((value_str, suffix)) = parse_tuir_value(input) {
        // Reject negative numbers for unsigned types
        if value_str.starts_with('-') {
            return Err("negative value not allowed for unsigned type");
        }
        let parsed: u64 = value_str
            .parse()
            .map_err(|_| "failed to parse numeric value")?;

        // Validate range based on suffix
        let max_val = match suffix {
            "U8" => u8::MAX as u64,
            "U16" => u16::MAX as u64,
            "U32" => u32::MAX as u64,
            _ => u64::MAX,
        };

        if parsed > max_val {
            return Err("value out of range for type");
        }

        return Ok(parsed);
    }

    Ok(0)
}

/// Parse a TUIR-formatted value string like "100U8" into (numeric_part, type_suffix).
fn parse_tuir_value(input: &str) -> Option<(&str, &str)> {
    let suffixes = ["U64", "U32", "U16", "U8"];
    for suffix in &suffixes {
        if input.ends_with(suffix) {
            return Some((&input[..input.len() - suffix.len()], suffix));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_tuff_empty_string_returns_zero() {
        assert_eq!(execute_tuff(""), Ok(0));
    }

    #[test]
    fn test_execute_tuff_whitespace_returns_zero() {
        assert_eq!(execute_tuff("   "), Ok(0));
        assert_eq!(execute_tuff("\t\n"), Ok(0));
        assert_eq!(execute_tuff(" \t \n "), Ok(0));
    }

    #[test]
    fn test_execute_tuff_100u8_returns_100() {
        assert_eq!(execute_tuff("100U8"), Ok(100));
    }

    #[test]
    fn test_execute_tuff_negative_u8_returns_err() {
        assert!(execute_tuff("-100U8").is_err());
    }

    #[test]
    fn test_execute_tuff_256u8_overflow_returns_err() {
        assert!(execute_tuff("256U8").is_err());
    }

    #[test]
    fn test_execute_tuff_addition_expression() {
        assert_eq!(execute_tuff("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn test_execute_tuff_multiple_additions() {
        assert_eq!(execute_tuff("1U8 + 2U8 + 3U8"), Ok(6));
    }

    #[test]
    fn test_execute_tuff_mixed_addition_subtraction() {
        assert_eq!(execute_tuff("3U8 + 2U8 - 4U8"), Ok(1));
    }

    #[test]
    fn test_execute_tuff_multiplication_with_subtraction() {
        assert_eq!(execute_tuff("3U8 * 2U8 - 4U8"), Ok(2));
    }

    #[test]
    fn test_execute_tuff_addition_after_multiplication_precedence() {
        assert_eq!(execute_tuff("4U8 + 3U8 * 2U8"), Ok(10));
    }

    #[test]
    fn test_execute_tuff_division_expression() {
        assert_eq!(execute_tuff("10U8 / 2U8"), Ok(5));
    }

    #[test]
    fn test_execute_tuff_integer_division_truncates() {
        assert_eq!(execute_tuff("10U8 / 3U8"), Ok(3));
    }

    #[test]
    fn test_execute_tuff_modulo_expression() {
        assert_eq!(execute_tuff("10U8 % 3U8"), Ok(1));
    }
}
