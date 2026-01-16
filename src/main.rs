mod parser;
mod pointers;
mod repl;
mod statements;
mod structs;
mod validators;
mod variables;
mod parse_utils;
use parser::interpret;

#[cfg(test)]
mod arithmetic_tests;
#[cfg(test)]
mod control_flow_tests;
#[cfg(test)]
mod loop_tests;
#[cfg(test)]
mod struct_tests;
#[cfg(test)]
mod variable_tests;

fn main() {
    repl::run();
}
