use std::collections::{HashMap, HashSet};
use std::io::{self, Write};

#[derive(Clone)]
struct Func {
    body_start: usize,
    params: Vec<String>,
}

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
    todo!()
}