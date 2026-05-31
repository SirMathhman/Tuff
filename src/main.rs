use std::io::{self, BufRead, Write};

#[allow(dead_code)]
pub fn interpret_tuff(_input: &str) -> i64 {
    0
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());

    println!("Tuff REPL (type 'quit' to exit)");

    for line in stdin.lock().lines() {
        match line {
            Ok(input) => {
                let trimmed = input.trim();
                if trimmed.eq_ignore_ascii_case("quit") {
                    break;
                }
                if trimmed.is_empty() {
                    continue;
                }

                let result = interpret_tuff(trimmed);
                writeln!(out, "{}", result).unwrap();
            }
            Err(e) => {
                eprintln!("Error reading input: {}", e);
                break;
            }
        }
    }
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
}
