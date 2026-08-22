use crate::eval;
use crate::lexer;
use crate::parser;

/// Run the full pipeline: source -> tokens -> AST -> value.
pub fn run(input: &str) -> Result<i64, crate::TuffError> {
    let tokens = lexer::lex(input)?;
    let ast = parser::parse(tokens)?;
    let mut env = eval::Env::default();
    eval::eval(&ast, &mut env)
}
