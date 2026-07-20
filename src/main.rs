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

fn interpret(_source_code: &str) -> i32 {
    0
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
}