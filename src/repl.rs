use std::io::Write;
use crate::interpret;

pub fn run() {
    println!("Tuff - Arithmetic Expression Interpreter");
    println!("Type expressions to evaluate, or 'quit' to exit.\n");

    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    let mut buffer = String::new();

    loop {
        print!("> ");
        let _ = stdout.flush();
        buffer.clear();

        match stdin.read_line(&mut buffer) {
            Ok(0) => break,
            Ok(_) => {
                let input = buffer.trim();

                if input.is_empty() {
                    continue;
                }

                if input.eq_ignore_ascii_case("quit") || input.eq_ignore_ascii_case("exit") {
                    println!("Goodbye!");
                    break;
                }

                match interpret(input) {
                    Ok(result) => println!("Result: {}\n", result),
                    Err(e) => println!("Error: {}\n", e),
                }
            }
            Err(e) => {
                eprintln!("Error reading input: {}", e);
                break;
            }
        }
    }
}
