// Tuff Compiler Modules

pub mod error;
pub mod lexer;
pub mod parser;
pub mod ast;
pub mod types;
pub mod type_checker;
pub mod borrow_checker;
pub mod codegen;
pub mod semantic_analyzer;

pub use error::{CompileError, ErrorCollector, Span};
pub use lexer::Lexer;
pub use parser::Parser;
pub use ast::Program;
pub use types::TypeEnvironment;
pub use type_checker::TypeChecker;
pub use borrow_checker::BorrowChecker;
pub use codegen::CodeGenerator;
