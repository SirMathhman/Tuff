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

    // Try to parse as a binary expression like "1U8 + 2U8"
    if let Some((left_str, op, right_str)) = split_expression(trimmed) {
        let left_val = evaluate_value(left_str.trim())?;
        let right_val = evaluate_value(right_str.trim())?;

        return match op {
            "+" => Ok(left_val + right_val),
            _ => Err("unsupported operator"),
        };
    }

    // Fall back to single value evaluation
    evaluate_value(trimmed)
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

/// Split an expression into (left_operand, operator, right_operand) by finding the first `+` at top level.
fn split_expression(input: &str) -> Option<(&str, &'static str, &str)> {
    // Find the last `+` that's not inside a TUIR suffix
    for i in 1..input.len() {
        if input.as_bytes()[i] == b'+' && !is_inside_suffix(input, i) {
            return Some((&input[..i], "+", &input[i + 1..]));
        }
    }
    None
}

/// Check if the `+` at position pos is part of a TUIR suffix (unlikely but safe guard).
fn is_inside_suffix(_input: &str, _pos: usize) -> bool {
    false // Suffixes don't contain `+`, so this is always safe
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
}
