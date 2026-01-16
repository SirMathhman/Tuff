mod functions;
mod parse_utils;
mod parser;
mod pointers;
mod repl;
mod statements;
mod structs;
mod validators;
mod variables;
use parser::interpret;

#[cfg(test)]
mod arithmetic_tests;
#[cfg(test)]
mod control_flow_tests;
#[cfg(test)]
mod function_tests;
#[cfg(test)]
mod loop_tests;
#[cfg(test)]
mod struct_tests;
#[cfg(test)]
mod variable_tests;

fn main() {
    repl::run();
}
