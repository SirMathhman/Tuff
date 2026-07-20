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
    let tokens: Vec<&str> = source_code.split_whitespace().collect();
    if tokens.is_empty() {
        return 0;
    }

    let mut result = tokens[0].parse::<i32>().unwrap_or(0);
    let mut i = 1;
    while i < tokens.len() {
        let op = tokens[i];
        let next = tokens.get(i + 1).map(|s| s.parse::<i32>().unwrap_or(0)).unwrap_or(0);
        match op {
            "+" => result += next,
            "-" => result -= next,
            "*" => result *= next,
            "/" => result /= next,
            _ => {}
        }
        i += 2;
    }
    result
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
}