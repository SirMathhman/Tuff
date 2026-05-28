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

    // Tokenize into values, operators (+, -, *, /, %), and parentheses (, )
    // A `-` at the start or immediately after another operator is a unary minus (part of the value)
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut prev_was_operator_or_open_paren = true;

    for ch in trimmed.chars() {
        if ch == '+' || ch == '-' || ch == '*' || ch == '/' || ch == '%' {
            // `-` at start or after operator/( is unary, keep it with the value
            if ch == '-' && prev_was_operator_or_open_paren {
                current.push(ch);
                continue;
            }
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            tokens.push(format!("{}", ch));
            prev_was_operator_or_open_paren = true;
        } else if ch == '(' || ch == ')' {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            tokens.push(format!("{}", ch));
            // `(` acts like an operator for unary minus purposes; `)` does not
            prev_was_operator_or_open_paren = ch == '(';
        } else if ch.is_whitespace() {
            continue;
        } else {
            current.push(ch);
            prev_was_operator_or_open_paren = false;
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }

    // Recursive descent parser:
    //   Expression -> Term (('+' | '-') Term)*
    //   Term       -> Factor (('*' | '/' | '%') Factor)*
    //   Factor     -> '(' Expression ')' | Value
    let mut pos = 0;
    let result = parse_expression(&tokens, &mut pos)?;

    if result < 0 {
        return Err("result underflows below zero");
    }
    Ok(result as u64)
}

// Parse: Term (('+' | '-') Term)*
fn parse_expression(tokens: &[String], pos: &mut usize) -> Result<i64, &'static str> {
    let mut result = parse_term(tokens, pos)?;

    while *pos < tokens.len() && (tokens[*pos] == "+" || tokens[*pos] == "-") {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_term(tokens, pos)?;
        result = match op.as_str() {
            "+" => result + right,
            _ => result - right,
        };
    }

    Ok(result)
}

// Parse: Factor (('*' | '/' | '%') Factor)*
fn parse_term(tokens: &[String], pos: &mut usize) -> Result<i64, &'static str> {
    let mut result = parse_factor(tokens, pos)?;

    while *pos < tokens.len() && (tokens[*pos] == "*" || tokens[*pos] == "/" || tokens[*pos] == "%")
    {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_factor(tokens, pos)?;
        result = match op.as_str() {
            "*" => result * right,
            "/" => {
                if right == 0 {
                    return Err("division by zero");
                }
                result / right
            }
            "%" => {
                if right == 0 {
                    return Err("modulo by zero");
                }
                result % right
            }
            _ => unreachable!(),
        };
    }

    Ok(result)
}

// Parse: '(' Expression ')' | Value
fn parse_factor(tokens: &[String], pos: &mut usize) -> Result<i64, &'static str> {
    if *pos >= tokens.len() {
        return Err("unexpected end of expression");
    }

    if tokens[*pos] == "(" {
        *pos += 1; // consume '('
        let result = parse_expression(tokens, pos)?;
        if *pos >= tokens.len() || tokens[*pos] != ")" {
            return Err("missing closing parenthesis");
        }
        *pos += 1; // consume ')'
        Ok(result)
    } else {
        let value = evaluate_value(&tokens[*pos])? as i64;
        *pos += 1;
        if value < 0 {
            return Err("result underflows below zero");
        }
        Ok(value)
    }
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

    #[test]
    fn test_execute_tuff_parenthesized_multiplication() {
        assert_eq!(execute_tuff("(4U8 + 3U8) * 2U8"), Ok(14));
    }
}
