use std::io::{self, Write};

/// Parse a single numeric literal, stripping any type suffix (U8, U16, I32, etc.).
fn parse_literal(token: &str) -> i64 {
    let token = token.trim();
    if token.is_empty() {
        return 0;
    }

    // Strip type suffix (e.g., U8, U16, I32, etc.)
    let num_str = if let Some(stripped) = token.strip_suffix("U8") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("U16") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("U32") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("U64") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("I8") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("I16") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("I32") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("I64") {
        stripped
    } else {
        token
    };

    num_str.parse::<i64>().unwrap_or(0)
}

fn interpret_tuff(source: &str) -> i64 {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return 0;
    }

    // Normalize multiple consecutive spaces into a single space.
    let mut normalized = trimmed.to_string();
    while normalized.contains("  ") {
        normalized = normalized.replace("  ", " ");
    }

    // Tokenize into operands and operators.
    // We replace each operator (with surrounding spaces) by a delimiter-wrapped version,
    // then split on the delimiter to get clean alternating [operand, op, operand, op, ...].
    let replaced = normalized
        .replace(" + ", "\u{0001}+\u{0001}")
        .replace(" - ", "\u{0001}-\u{0001}")
        .replace(" * ", "\u{0001}*\u{0001}");

    let tokens: Vec<&str> = replaced
        .split('\u{0001}')
        .filter(|t| !t.is_empty())
        .collect();

    // Parse alternating operands and operators.
    // e.g., ["3U8", "*", "4U8", "-", "5U8"] => [(3,Some('*')), (4,Some('-')), (5,None)]
    let mut terms: Vec<(i64, Option<char>)> = Vec::new();
    for i in 0..tokens.len() {
        if i % 2 == 0 {
            // Operand
            terms.push((parse_literal(tokens[i]), None));
        } else {
            // Operator — attach to the previous term
            let op = tokens[i].chars().next();
            if let Some(last) = terms.last_mut() {
                last.1 = op;
            }
        }
    }

    // Pass 1: evaluate multiplications (higher precedence)
    let mut reduced: Vec<(i64, Option<char>)> = Vec::new();
    for term in terms {
        if let Some((_, Some('*'))) = reduced.last() {
            // Previous operator is *, multiply the values together
            let right_val = term.0;
            let (left_val, _) = reduced.pop().unwrap();
            let product = left_val * right_val;
            // Push the product as a new entry with the operator that follows it
            reduced.push((product, term.1));
        } else {
            reduced.push(term);
        }
    }

    // Pass 2: evaluate additions and subtractions (left to right)
    let mut result = reduced.first().map_or(0, |t| t.0);
    for i in 1..reduced.len() {
        if let Some((_, Some(op))) = reduced.get(i - 1) {
            match op {
                '+' => result += reduced[i].0,
                '-' => result -= reduced[i].0,
                _ => {}
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string_returns_zero() {
        assert_eq!(interpret_tuff(""), 0);
    }

    #[test]
    fn test_whitespace_returns_zero() {
        assert_eq!(interpret_tuff("   "), 0);
    }

    #[test]
    fn test_literal_number() {
        assert_eq!(interpret_tuff("100"), 100);
    }

    #[test]
    fn test_u8_literal() {
        assert_eq!(interpret_tuff("100U8"), 100);
    }

    #[test]
    fn test_u16_literal() {
        assert_eq!(interpret_tuff("100U16"), 100);
    }

    #[test]
    fn test_u32_literal() {
        assert_eq!(interpret_tuff("42U32"), 42);
    }

    #[test]
    fn test_u64_literal() {
        assert_eq!(interpret_tuff("42U64"), 42);
    }

    #[test]
    fn test_i8_literal() {
        assert_eq!(interpret_tuff("-5I8"), -5);
    }

    #[test]
    fn test_i16_literal() {
        assert_eq!(interpret_tuff("300I16"), 300);
    }

    #[test]
    fn test_i32_literal() {
        assert_eq!(interpret_tuff("-100I32"), -100);
    }

    #[test]
    fn test_i64_literal() {
        assert_eq!(interpret_tuff("999I64"), 999);
    }

    #[test]
    fn test_invalid_string_returns_zero() {
        assert_eq!(interpret_tuff("hello"), 0);
    }

    #[test]
    fn test_addition_expression() {
        assert_eq!(interpret_tuff("1U8 + 2U8"), 3);
    }

    #[test]
    fn test_multi_addition_expression() {
        assert_eq!(interpret_tuff("1U8 + 2U8 + 3U8"), 6);
    }

    #[test]
    fn test_mixed_add_subtract_expression() {
        assert_eq!(interpret_tuff("3U8 + 4U8 - 5U8"), 2);
    }

    #[test]
    fn test_multiply_and_subtract_expression() {
        assert_eq!(interpret_tuff("3U8 *  4U8 - 5U8"), 7);
    }

    #[test]
    fn test_addition_with_multiplication_precedence() {
        assert_eq!(interpret_tuff("3U8 + 4U8 * 5U8"), 23);
    }
}

#[cfg(not(coverage))]
fn main() {
    loop {
        print!(">>> ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        match io::stdin().read_line(&mut input) {
            Ok(_) => {}
            Err(_) => break,
        }

        let result = interpret_tuff(&input);
        println!("{}", result);
    }
}
