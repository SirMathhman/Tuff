package com.tuff

fun tokenize(input: String): Result<List<Token>> {
    if (input.isBlank()) return Result.failure(EvalError.EmptyExpression(0))
    val rawTokens = input.trim().split(" ")

    val result = mutableListOf<Token>()

    for (i in rawTokens.indices) {
        var token = rawTokens[i]

        // Strip leading paren
        if (token.startsWith("(")) {
            result.add(Token.LParen)
            token = token.substring(1)
        }

        // Strip trailing paren
        if (token.endsWith(")")) {
            token = token.dropLast(1)
            // We'll add RParen after processing the rest
        }

        if (token.isNotEmpty()) {
            when (token) {
                "+" -> result.add(Token.Op(OpKind.PLUS))
                "-" -> result.add(Token.Op(OpKind.MINUS))
                "*" -> result.add(Token.Op(OpKind.MULTIPLY))
                else -> {
                    val value = token.toIntOrNull()
                        ?: return Result.failure(
                            if (token.length == 1 && !token[0].isLetterOrDigit())
                                EvalError.UnexpectedToken(i, token)
                            else
                                EvalError.NonNumericToken(i, rawTokens[i])
                        )
                    result.add(Token.Number(value))
                }
            }
        }

        // Add trailing paren
        if (rawTokens[i].endsWith(")")) {
            result.add(Token.RParen)
        }
    }

    // Validate: must start with Number or LParen, end with Number or RParen
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
