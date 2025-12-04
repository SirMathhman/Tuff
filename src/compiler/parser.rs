// Parser Module (Stub)

use crate::compiler::ast::Program;

pub struct Parser {
    // TODO: Implement parser
}

impl Parser {
    pub fn new() -> Self {
        Parser {}
    }

    pub fn parse(&mut self) -> Program {
        Program {
            items: Vec::new(),
        }
    }
}

impl Default for Parser {
    fn default() -> Self {
        Self::new()
    }
}
