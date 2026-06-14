use std::io::{self, BufRead, Write};

// --- Simple recursive-descent parser ---
// Expr   -> Term (('+' | '-') Term)*
// Term   -> Factor (('*' | '/') Factor)*
// Factor -> '(' Expr ')' | Number
// Number -> digit+

type ParseResult = Result<i64, String>;

fn parse_expr(input: &mut &[u8]) -> ParseResult {
    let mut result = parse_term(input)?;
    loop {
        skip_spaces(input);
        match input.first().copied() {
            Some(b'+') | Some(b'-') => {}
            _ => break,
        }
        let op = input[0];
        *input = &input[1..]; // consume operator
        skip_spaces(input);
        let rhs = parse_term(input)?;
        match op {
            b'+' => result += rhs,
            b'-' => result -= rhs,
            _ => unreachable!(),
        }
    }
    Ok(result)
}

fn parse_term(input: &mut &[u8]) -> ParseResult {
    let mut result = parse_factor(input)?;
    loop {
        skip_spaces(input);
        match input.first().copied() {
            Some(b'*') | Some(b'/') => {}
            _ => break,
        }
        let op = input[0];
        *input = &input[1..]; // consume operator
        skip_spaces(input);
        let rhs = parse_factor(input)?;
        match op {
            b'*' => result *= rhs,
            b'/' => {
                if rhs == 0 {
                    return Err("division by zero".to_string());
                }
                result /= rhs;
            }
            _ => unreachable!(),
        }
    }
    Ok(result)
}

fn parse_factor(input: &mut &[u8]) -> ParseResult {
    skip_spaces(input);
    if input.first().copied() == Some(b'(') {
        *input = &input[1..]; // consume '('
        let val = parse_expr(input)?;
        skip_spaces(input);
        if input.first().copied() != Some(b')') {
            return Err("expected ')'".to_string());
        }
        *input = &input[1..]; // consume ')'
        Ok(val)
    } else {
        let mut chars = Vec::new();
        while input.first().map_or(false, |&c| c.is_ascii_digit()) {
            chars.push(input[0]);
            *input = &input[1..];
        }
        if chars.is_empty() {
            return Err("expected number".to_string());
        }
        let s: String = chars.into_iter().map(|b| b as char).collect();
        match s.parse::<i64>() {
            Ok(n) => Ok(n),
            Err(_) => Err(format!("invalid integer: {}", s)),
        }
    }
}

fn skip_spaces(input: &mut &[u8]) {
    while input.first().copied() == Some(b' ') || input.first().copied() == Some(b'\t') {
        *input = &input[1..];
    }
}

fn execute_tuff(source: &str) -> Result<i64, String> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    let mut input: &[u8] = trimmed.as_bytes();
    parse_expr(&mut input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string_returns_zero() {
        assert_eq!(execute_tuff(""), Ok(0));
    }

    #[test]
    fn test_whitespace_returns_zero() {
        assert_eq!(execute_tuff("   "), Ok(0));
        assert_eq!(execute_tuff("\t\n"), Ok(0));
    }

    #[test]
    fn test_numeric_literal() {
        assert_eq!(execute_tuff("100"), Ok(100));
    }

    #[test]
    fn test_addition_expression() {
        assert_eq!(execute_tuff("1 + 2"), Ok(3));
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(execute_tuff("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_mixed_add_subtract() {
        assert_eq!(execute_tuff("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn test_multiplication_precedence() {
        assert_eq!(execute_tuff("2 * 3 - 4"), Ok(2));
    }

    #[test]
    fn test_addition_with_higher_precedence_multiply() {
        assert_eq!(execute_tuff("2 + 3 * 4"), Ok(14));
    }

    #[test]
    fn test_parenthesized_expression() {
        assert_eq!(execute_tuff("(2 + 3) * 4"), Ok(20));
    }

    #[test]
    fn test_division_by_zero_error() {
        assert!(execute_tuff("1 / (1 - 1)").is_err());
    }
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    println!("Tuff REPL (type 'quit' to exit)");

    loop {
        write!(out, "> ").unwrap();
        out.flush().unwrap();

        let line = stdin.lock().lines().next().unwrap().unwrap();

        if line.trim() == "quit" {
            break;
        }

        if line.trim().is_empty() {
            continue;
        }

        match execute_tuff(&line) {
            Ok(result) => println!("= {}", result),
            Err(e) => println!("error: {}", e),
        }
    }
}
