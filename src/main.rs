#![cfg_attr(coverage_nightly, feature(coverage_attribute))]

mod lexer;
pub(crate) mod parser;
mod parser_declarations;
mod parser_expressions;
pub(crate) mod parser_statements;
pub(crate) mod scope;

#[cfg_attr(coverage_nightly, coverage(off))]
fn main() {
    use std::io::{self, BufRead};

    println!("Tuff REPL — type an expression and press Enter (Ctrl+C to quit)");

    let stdin = io::stdin();

    for line in stdin.lock().lines() {
        match line {
            Ok(input) => {
                if input.trim().is_empty() {
                    continue;
                }
                match parser::interpret(&input) {
                    Ok(result) => println!("{}", result),
                    Err(e) => eprintln!("Error: {}", e),
                }
            }
            Err(_) => break,
        }
    }
}

#[cfg(test)]
mod tests_control_flow;
#[cfg(test)]
mod tests_literals;
