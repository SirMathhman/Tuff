use std::io::{self, Write};

fn main() {
    println!("Tuff REPL. Type 'quit' to exit.");
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    loop {
        print!("> ");
        stdout.flush().unwrap();

        let mut input = String::new();
        stdin.read_line(&mut input).unwrap();
        let input = input.trim();

        if input == "quit" {
            break;
        }

        let result = interpret(input);
        println!("{}", result);
    }
}

fn interpret(source_code: &str) -> i32 {
    let tokens = tokenize(source_code);
    if tokens.is_empty() {
        return 0;
    }
    let mut pos = 0;
    parse_expr(&tokens, &mut pos)
}

fn tokenize(source: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    for ch in source.chars() {
        match ch {
            '(' | ')' => {
                if !current.is_empty() {
                    tokens.push(current.clone());
                    current.clear();
                }
                tokens.push(ch.to_string());
            }
            ' ' | '\t' => {
                if !current.is_empty() {
                    tokens.push(current.clone());
                    current.clear();
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn parse_expr(tokens: &[String], pos: &mut usize) -> i32 {
    let mut result = parse_term(tokens, pos);
    while *pos < tokens.len() && (tokens[*pos] == "+" || tokens[*pos] == "-") {
        let op = &tokens[*pos];
        *pos += 1;
        let right = parse_term(tokens, pos);
        match op.as_str() {
            "+" => result += right,
            "-" => result -= right,
            _ => unreachable!(),
        }
    }
    result
}

fn parse_term(tokens: &[String], pos: &mut usize) -> i32 {
    let mut result = parse_factor(tokens, pos);
    while *pos < tokens.len() && (tokens[*pos] == "*" || tokens[*pos] == "/") {
        let op = &tokens[*pos];
        *pos += 1;
        let right = parse_factor(tokens, pos);
        match op.as_str() {
            "*" => result *= right,
            "/" => result /= right,
            _ => unreachable!(),
        }
    }
    result
}

fn parse_factor(tokens: &[String], pos: &mut usize) -> i32 {
    let token = &tokens[*pos];
    if token == "(" {
        *pos += 1; // consume '('
        let result = parse_expr(tokens, pos);
        if *pos < tokens.len() && tokens[*pos] == ")" {
            *pos += 1; // consume ')'
        }
        result
    } else {
        *pos += 1;
        token.parse::<i32>().unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_input() {
        assert_eq!(interpret(""), 0);
    }

    #[test]
    fn test_whitespace_input() {
        assert_eq!(interpret(" "), 0);
    }

    #[test]
    fn test_numeric_input() {
        assert_eq!(interpret("1"), 1);
    }

    #[test]
    fn test_addition() {
        assert_eq!(interpret("1 + 2"), 3);
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(interpret("1 + 2 + 3"), 6);
    }

    #[test]
    fn test_operator_precedence() {
        assert_eq!(interpret("1 + 2 * 3"), 7);
    }

    #[test]
    fn test_parentheses() {
        assert_eq!(interpret("(1 + 2) * 3"), 9);
    }
}