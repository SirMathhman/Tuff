use std::io::{self, Write};
use tuff::interpret;

fn main() {
    println!("Tuff REPL - v0.1.0");
    println!("Type '#exit', '#quit', or '#help' for commands");
    println!();

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    loop {
        print!(">> ");
        let _ = stdout.flush();

        let mut input = String::new();
        match stdin.read_line(&mut input) {
            Ok(0) => {
                // EOF
                println!();
                break;
            }
            Ok(_) => {
                let trimmed = input.trim();

                match trimmed {
                    "#exit" | "#quit" => {
                        println!("Goodbye!");
                        break;
                    }
                    "#help" => {
                        print_help();
                        continue;
                    }
                    "" => continue,
                    _ => match interpret(trimmed) {
                        Ok(result) => {
                            if !result.is_empty() {
                                println!("{}", result);
                            }
                        }
                        Err(e) => {
                            eprintln!("Error: {}", e);
                        }
                    },
                }
            }
            Err(e) => {
                eprintln!("Error reading input: {}", e);
                break;
            }
        }
    }
}

fn print_help() {
    println!("Tuff Language - Quick Reference");
    println!();
    println!("Literals & Expressions:");
    println!("  100U8, 50I32        - Typed integer literals");
    println!("  1 + 2 * 3           - Arithmetic expressions");
    println!("  true, false         - Boolean literals");
    println!();
    println!("Variables:");
    println!("  let x = 100;        - Immutable binding");
    println!("  let mut x = 100;    - Mutable binding");
    println!("  x = 200;            - Assignment (requires mut)");
    println!();
    println!("Functions:");
    println!("  fn add(a: I32, b: I32): I32 => a + b; add(1, 2)");
    println!("  fn get() => 100; get()");
    println!();
    println!("Classes:");
    println!("  class fn Point(x: I32, y: I32) => {{ ... }}");
    println!();
    println!("Control Flow:");
    println!("  if (x > 0) {{ x }} else {{ 0 }}");
    println!("  while (x < 10) {{ x += 1 }}");
    println!();
    println!("REPL Commands (prefix with #):");
    println!("  #help               - Show this help");
    println!("  #exit, #quit        - Exit the REPL");
    println!();
}
