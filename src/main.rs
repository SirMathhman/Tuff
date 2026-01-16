mod parser;
mod pointers;
mod repl;
mod statements;
mod validators;
mod variables;
use parser::interpret;

#[cfg(test)]
mod arithmetic_tests;
#[cfg(test)]
mod variable_tests;
#[cfg(test)]
mod control_flow_tests;
#[cfg(test)]
mod loop_tests;

fn main() {
    repl::run();
}
