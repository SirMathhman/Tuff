package com.tuff

fun evaluate(input: String): Result<Int> {
    return tokenize(input).fold(
        onSuccess = { evaluate(it) },
        onFailure = { Result.failure(it) }
    )
}

fun evaluate(tokens: List<Token>): Result<Int> {
    val parser = TokenParser(tokens)
    return try {
        val result = parser.parseExpression()
        if (!parser.isAtEnd) {
            Result.failure(EvalError.UnexpectedToken(parser.position, tokens[parser.position].toString()))
        } else {
            Result.success(result)
        }
    } catch (e: EvalError) {
        Result.failure(e)
    }
}

private class TokenParser(private val tokens: List<Token>) {
    private var pos = 0

    val position: Int get() = pos
    val isAtEnd: Boolean get() = pos >= tokens.size

    private fun peek(): Token? = tokens.getOrNull(pos)
    private fun advance(): Token = tokens[pos++]

    fun parseExpression(): Int {
        var result = parseTerm()
        while (true) {
            val token = peek() ?: break
            if (token is Token.Op && (token.kind == OpKind.PLUS || token.kind == OpKind.MINUS)) {
                advance()
                val term = parseTerm()
                result = if (token.kind == OpKind.PLUS) result + term else result - term
            } else {
                break
            }
        }
        return result
    }

    private fun parseTerm(): Int {
        var result = parseFactor()
        while (true) {
            val token = peek() ?: break
            if (token is Token.Op && token.kind == OpKind.MULTIPLY) {
                advance()
                val factor = parseFactor()
                result *= factor
            } else {
                break
            }
        }
        return result
    }

    private fun parseFactor(): Int {
        if (isAtEnd) throw EvalError.UnexpectedToken(pos, "<end>")
        val token = advance()
        return when {
            token is Token.Number -> token.value
            token is Token.LParen -> {
                val result = parseExpression()
                expect(Token.RParen)
                result
            }

            else -> throw EvalError.UnexpectedToken(pos - 1, token.toString())
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
