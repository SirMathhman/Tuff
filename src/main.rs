mod ast;
mod lexer;
mod parser;
mod value;

use std::io::{self, Write};
use parser::Parser;
use value::Evaluator;

fn main() {
    println!("Tuff Interpreter v0.1.0");
    println!("Type 'exit' to quit\n");

    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut evaluator = Evaluator::new();

    loop {
        print!("> ");
        stdout.flush().unwrap();

        let mut input = String::new();
        stdin.read_line(&mut input).unwrap();
        let input = input.trim();

        if input == "exit" || input == "quit" {
            break;
        }

        if input.is_empty() {
            continue;
        }

        match run(&mut evaluator, input) {
            Ok(result) => println!("{}", result),
            Err(err) => println!("Error: {}", err),
        }
    }

    println!("Goodbye!");
}

fn run(evaluator: &mut Evaluator, input: &str) -> Result<String, String> {
    let mut parser = Parser::new(input);
    let program = parser.parse()?;
    let result = evaluator.eval_program(&program)?;
    Ok(result.to_string())
}
