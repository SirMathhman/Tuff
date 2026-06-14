use std::io::{self, BufRead, Write};

fn execute_tuff(source: &str) -> i64 {
    if source.trim().is_empty() {
        return 0;
    }
    /*This is a TODO for now.*/
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string_returns_zero() {
        assert_eq!(execute_tuff(""), 0);
    }

    #[test]
    fn test_whitespace_returns_zero() {
        assert_eq!(execute_tuff("   "), 0);
        assert_eq!(execute_tuff("\t\n"), 0);
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

        match std::panic::catch_unwind(|| execute_tuff(&line)) {
            Ok(result) => println!("= {}", result),
            Err(_) => println!("error: evaluation failed"),
        }
    }
}
