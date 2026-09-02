package com.tuff

fun tokenize(input: String): Result<List<Token>> {
    if (input.isBlank()) return Result.failure(EvalError.EmptyExpression(0))

    val result = mutableListOf<Token>()
    var i = 0

    while (i < input.length) {
        val c = input[i]

        // Skip whitespace
        if (c.isWhitespace()) { i++; continue }

        // Multi-char operators (try before single-char)
        if (c == '=' && i + 1 < input.length && input[i + 1] == '=') {
            result.add(Token.Op(OpKind.EQ)); i += 2; continue
        }
        if (c == '|' && i + 1 < input.length && input[i + 1] == '|') {
            result.add(Token.Op(OpKind.OR)); i += 2; continue
        }

        // Single-char tokens
        when (c) {
            '(' -> { result.add(Token.LParen); i++ }
            ')' -> { result.add(Token.RParen); i++ }
            '{' -> { result.add(Token.LBrace); i++ }
            '}' -> { result.add(Token.RBrace); i++ }
            '+' -> { result.add(Token.Op(OpKind.PLUS)); i++ }
            '-' -> { result.add(Token.Op(OpKind.MINUS)); i++ }
            '*' -> { result.add(Token.Star); i++ }
            '=' -> { result.add(Token.Equals); i++ }
            ';' -> { result.add(Token.Semicolon); i++ }
            '&' -> { result.add(Token.Ref); i++ }
            else -> {
                if (!c.isLetterOrDigit()) {
                    return Result.failure(EvalError.UnexpectedToken(i, c.toString()))
                }
                // Identifier or number run
                val start = i
                while (i < input.length && input[i].isLetterOrDigit()) i++
                val word = input.substring(start, i)
                when (word) {
                    "let" -> result.add(Token.Let)
                    "mut" -> result.add(Token.Mut)
                    "true" -> result.add(Token.Number(1))
                    "false" -> result.add(Token.Number(0))
                    else -> {
                        if (word.first().isLetter()) {
                            result.add(Token.Identifier(word))
                        } else {
                            val value = word.toIntOrNull()
                                ?: return Result.failure(EvalError.NonNumericToken(start, word))
                            result.add(Token.Number(value))
                        }
                    }
                }
            }
        }
    }

    // Validate: must start with Number or opening delimiter, end with Number or closing delimiter
    if (result.isEmpty()) return Result.failure(EvalError.EmptyExpression(0))
    val first = result.first()
    if (first is Token.Op) {
        return Result.failure(EvalError.UnexpectedToken(0, first.toString()))
    }
    val last = result.last()
    if (last is Token.Op) {
        return Result.failure(EvalError.UnexpectedToken(result.size - 1, last.toString()))
    }

    return Result.success(result)
}
