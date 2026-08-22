use crate::eval;
use crate::lexer;
use crate::parser;

/// Run the full pipeline: source -> tokens -> AST -> analyzed -> value.
/// The analysis pass type-checks the whole program (both `if` branches);
/// the evaluation pass then executes only the taken branches.
pub fn run(input: &str) -> Result<eval::Value, crate::TuffError> {
    let tokens = lexer::lex(input)?;
    let ast = parser::parse(tokens)?;
    let mut type_env = eval::TypeEnv::default();
    eval::analyze(&ast, &mut type_env)?;
    let mut env = eval::Env::default();
    eval::eval(&ast, &mut env)
}
