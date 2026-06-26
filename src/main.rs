use std::io::{self, BufRead};

fn main() {
    println!("Tuff interpreter — type an expression and press Enter (Ctrl+C to quit)");
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        match line {
            Ok(input) => {
                if input.trim().is_empty() {
                    continue;
                }
                println!("{}", Tuff::interpret_tuff(&input));
            }
            Err(e) => eprintln!("error: {}", e),
        }
    }
}
