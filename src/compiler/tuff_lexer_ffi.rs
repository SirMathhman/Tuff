// FFI bridge between Rust compiler and Tuff lexer
// Provides Rust interface to call Tuff-based tokenization

use crate::compiler::lexer::Token;
use crate::compiler::lexer::TokenKind;
use crate::compiler::Span;

/// Bridge lexer that will eventually call Tuff lexer implementation
/// For now, delegates to Rust lexer to maintain compatibility
pub struct TuffLexerBridge;

impl TuffLexerBridge {
    /// Tokenize using Tuff lexer (currently delegating to Rust version)
    /// TODO: When tuff/lexer.tuff is mature, call it via FFI
    pub fn tokenize(input: &str, filename: impl Into<String>) -> Vec<Token> {
        let filename = filename.into();
        
        // TODO: Eventually this will call the Tuff lexer via FFI:
        // let tokens = unsafe { tuff_lexer_tokenize(input.as_ptr(), input.len(), filename.as_ptr()) };
        // Convert C tokens back to Rust Token struct
        
        // For now, use Rust lexer as fallback
        let mut lexer = crate::compiler::lexer::Lexer::new(input, &filename);
        lexer.tokenize()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tuff_lexer_bridge() {
        // Bridge should produce tokens for simple Tuff code
        let input = "let x = 42;";
        let tokens = TuffLexerBridge::tokenize(input, "test.tuff");
        
        assert!(!tokens.is_empty());
        assert_eq!(tokens[0].kind, TokenKind::Let);
    }
}
