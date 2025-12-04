// Tuff Compiler Modules

pub mod ast;
pub mod borrow_checker;
pub mod codegen;
pub mod error;
pub mod lexer;
pub mod parser;
pub mod semantic_analyzer;
pub mod type_checker;
pub mod types;
pub mod tuff_lexer_ffi;

pub use ast::Program;
pub use borrow_checker::BorrowChecker;
pub use codegen::CodeGenerator;
pub use error::{CompileError, ErrorCollector, Span};
pub use lexer::Lexer;
pub use parser::Parser;
pub use type_checker::TypeChecker;
pub use types::TypeEnvironment;
pub use tuff_lexer_ffi::TuffLexerBridge;
