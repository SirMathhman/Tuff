//! Tuff REPL — interactive command-line interface for the Tuff interpreter.

use tuffc::interpret_tuff;

/// Interactive REPL that reads Tuff expressions from stdin and prints results.
fn main() {
    use std::io::{self, BufRead, Write};

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    loop {
        print!("> ");
        stdout.flush().ok();

        let mut line = String::new();
        if stdin.lock().read_line(&mut line).is_err() || line.trim().is_empty() {
            break;
        }

        match interpret_tuff(line.trim()) {
            Ok(val) => println!("{val}"),
            Err(e) => println!("Error: {e}"),
        }
    }
}
