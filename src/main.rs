#![cfg_attr(coverage_nightly, feature(coverage_attribute))]

#[cfg_attr(coverage_nightly, coverage(off))]
fn main() {
    use std::io::{self, BufRead};

    println!("Tuff REPL — type an expression and press Enter (Ctrl+C to quit)");

    let stdin = io::stdin();

    for line in stdin.lock().lines() {
        match line {
            Ok(input) => {
                if input.trim().is_empty() {
                    continue;
                }
                match interpret(&input) {
                    Ok(result) => println!("{}", result),
                    Err(e) => eprintln!("Error: {}", e),
                }
            }
            Err(_) => break,
        }
    }
}

fn interpret(source: &str) -> Result<i64, &'static str> {
    let tokens = tokenize(source);
    if tokens.is_empty() {
        return Ok(0);
    }
    parse_expression(&tokens, &mut 0).map_err(|_| "parse error")
}

fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();

    while let Some(&ch) = chars.peek() {
        if ch.is_whitespace() {
            chars.next();
        } else if matches!(ch, '(' | ')' | '+' | '*' | '/' | '%') {
            tokens.push(ch.to_string());
            chars.next();
        } else if ch == '-'
            && !tokens.is_empty()
            && !matches!(&*tokens[tokens.len() - 1], "(" | "+" | "-" | "*")
        {
            tokens.push("-".to_string());
            chars.next();
        } else if ch.is_ascii_digit()
            || (ch == '-'
                && (tokens.is_empty()
                    || matches!(&*tokens[tokens.len() - 1], "(" | "+" | "-" | "*")))
        {
            let mut num = String::new();
            while let Some(&c) = chars.peek() {
                if c.is_ascii_digit() || (num.is_empty() && c == '-') {
                    num.push(c);
                    chars.next();
                } else {
                    break;
                }
            }
            tokens.push(num);
        } else {
            chars.next();
        }
    }

    tokens
}

fn parse_expression(tokens: &[String], pos: &mut usize) -> Result<i64, ()> {
    let mut left = parse_term(tokens, pos)?;

    while *pos < tokens.len() && (tokens[*pos] == "+" || tokens[*pos] == "-") {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_term(tokens, pos)?;
        left = if op == "+" {
            left + right
        } else {
            left - right
        };
    }

    Ok(left)
}

fn parse_term(tokens: &[String], pos: &mut usize) -> Result<i64, ()> {
    let mut left = parse_factor(tokens, pos)?;

    while *pos < tokens.len() && (tokens[*pos] == "*" || tokens[*pos] == "/" || tokens[*pos] == "%") {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_factor(tokens, pos)?;
        left = if op == "*" {
            left * right
        } else if op == "/" {
            left / right
        } else {
            left % right
        };
    }

    Ok(left)
}

fn parse_factor(tokens: &[String], pos: &mut usize) -> Result<i64, ()> {
    if *pos >= tokens.len() {
        return Err(());
    }

    let token = &tokens[*pos];

    if token == "(" {
        *pos += 1;
        let val = parse_expression(tokens, pos)?;
        if *pos < tokens.len() && tokens[*pos] == ")" {
            *pos += 1;
        }
        Ok(val)
    } else if let Ok(n) = token.parse::<i64>() {
        *pos += 1;
        Ok(n)
    } else {
        Err(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string() {
        assert_eq!(interpret(""), Ok(0));
    }

    #[test]
    fn test_whitespace_only() {
        assert_eq!(interpret(" "), Ok(0));
    }

    #[test]
    fn test_single_digit() {
        assert_eq!(interpret("1"), Ok(1));
    }

    #[test]
    fn test_single_digit_two() {
        assert_eq!(interpret("2"), Ok(2));
    }

    #[test]
    fn test_addition_expression() {
        assert_eq!(interpret("1 + 2"), Ok(3));
    }

    #[test]
    fn test_invalid_expression_returns_ok_zero() {
        assert_eq!(interpret("abc"), Ok(0));
    }

    #[test]
    fn test_parse_error_returns_err() {
        assert!(interpret(")").is_err());
    }

    #[test]
    fn test_negative_addition() {
        assert_eq!(interpret("-1 + -2"), Ok(-3));
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(interpret("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_mixed_add_subtract() {
        assert_eq!(interpret("3 + 2 - 4"), Ok(1));
    }

    #[test]
    fn test_multiplication_expression() {
        assert_eq!(interpret("5 * 3"), Ok(15));
    }

    #[test]
    fn test_mixed_mul_subtract() {
        assert_eq!(interpret("3 * 2 - 4"), Ok(2));
    }

    #[test]
    fn test_precedence_add_then_mul() {
        assert_eq!(interpret("3 + 2 * 4"), Ok(11));
    }

    #[test]
    fn test_division_truncates() {
        assert_eq!(interpret("5 / 3"), Ok(1));
    }

    #[test]
    fn test_trailing_mul_operator() {
        assert!(interpret("5 *").is_err());
    }

    #[test]
    fn test_trailing_add_operator() {
        assert!(interpret("5 +").is_err());
    }

    #[test]
    fn test_parenthesized_expression() {
        assert_eq!(interpret("(3 + 2) * 4"), Ok(20));
    }

    #[test]
    fn test_empty_parens() {
        assert!(interpret("()").is_err());
    }

    #[test]
    fn test_unrecognized_token_in_factor() {
        assert!(interpret(")").is_err());
    }

    #[test]
    fn test_division_expression() {
        assert_eq!(interpret("6 / 2"), Ok(3));
    }

    #[test]
    fn test_modulo_expression() {
        assert_eq!(interpret("5 % 3"), Ok(2));
    }
}
