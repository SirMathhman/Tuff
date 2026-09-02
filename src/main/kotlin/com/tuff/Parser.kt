package com.tuff

fun parse(tokens: List<Token>): Result<Ast> {
    val parser = ParserImpl(tokens)
    return try {
        val ast = parser.parseExpression()
        if (!parser.isAtEnd) {
            Result.failure(EvalError.UnexpectedToken(parser.position, tokens[parser.position].toString()))
        } else {
            Result.success(ast)
        }
    } catch (e: EvalError) {
        Result.failure(e)
    }
}

private class ParserImpl(private val tokens: List<Token>) {
    private var pos = 0

    val position: Int get() = pos
    val isAtEnd: Boolean get() = pos >= tokens.size

    private fun peek(): Token? = tokens.getOrNull(pos)
    private fun advance(): Token = tokens[pos++]

    fun parseExpression(): Ast {
        var left = parseTerm()
        while (true) {
            val token = peek() ?: break
            if (token is Token.Op && (token.kind == OpKind.PLUS || token.kind == OpKind.MINUS)) {
                advance()
                val right = parseTerm()
                left = Ast.BinaryOp(token.kind, left, right)
            } else {
                break
            }
        }
        return left
    }

    private fun parseTerm(): Ast {
        var left = parseFactor()
        while (true) {
            val token = peek() ?: break
            if (token is Token.Op && token.kind == OpKind.MULTIPLY) {
                advance()
                val right = parseFactor()
                left = Ast.BinaryOp(token.kind, left, right)
            } else {
                break
            }
        }
        return left
    }

    private fun parseFactor(): Ast {
        if (isAtEnd) throw EvalError.UnexpectedToken(pos, "<end>")
        return when (val token = advance()) {
            is Token.Number -> Ast.Number(token.value)
            is Token.LParen -> {
                val ast = parseExpression()
                expect(Token.RParen)
                ast
            }
            is Token.Op, is Token.RParen -> throw EvalError.UnexpectedToken(pos - 1, token.toString())
        }
    }

    private fun expect(expected: Token) {
        if (isAtEnd) throw EvalError.UnexpectedToken(pos, "<end>")
        val token = advance()
        if (token != expected) {
            throw EvalError.UnexpectedToken(pos - 1, token.toString())
        }
    }
}
