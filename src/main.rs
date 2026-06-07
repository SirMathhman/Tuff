fn execute_tuff(input: &str) -> i32 {
    0
}

use std::io::{self, BufRead, Write};

fn main() {
    let stdin = io::stdin();
    loop {
        print!("> ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        match stdin.lock().read_line(&mut input) {
            Ok(0) => break, // EOF
            Ok(_) => {
                let trimmed = input.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let result = execute_tuff(trimmed);
                println!("{}", result);
            }
            Err(_) => break,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_tuff_empty_string() {
        assert_eq!(execute_tuff(""), 0);
    }

    #[test]
    fn test_execute_tuff_whitespace() {
        assert_eq!(execute_tuff("   "), 0);
    }
}
