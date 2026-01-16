mod parser;
mod pointers;
mod repl;
mod statements;
mod validators;
mod variables;
use parser::interpret;

#[cfg(test)]
mod main_tests;

fn main() {
    repl::run();
}
