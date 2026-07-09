use crate::scope::Scope;

pub fn interpret(source: &str) -> Result<i64, String> {
    use crate::lexer;
    let tokens = lexer::tokenize(source);
    if tokens.is_empty() {
        return Ok(0);
    }
    let mut scope = Scope::new();
    crate::parser_statements::parse_statements(&tokens, &mut 0, &mut scope)
        .map_err(|e: crate::scope::ParseError| e.to_string())
}
