package com.tuff

fun tokenize(input: String): Result<List<Token>> {
    if (input.isBlank()) return Result.failure(EvalError.EmptyExpression(0))

    // Insert spaces around delimiters and operators so they become standalone tokens
    val normalized = input
        .replace("(", " ( ")
        .replace(")", " ) ")
        .replace("{", " { ")
        .replace("}", " } ")
        .replace(";", " ; ")
        .replace("=", " = ")
        .replace("&", " & ")
        .replace("*", " * ")
    val rawTokens = normalized.trim().split(" ").filter { it.isNotEmpty() }

    val result = mutableListOf<Token>()

    for (i in rawTokens.indices) {
        when (rawTokens[i]) {
            "(" -> result.add(Token.LParen)
            ")" -> result.add(Token.RParen)
            "{" -> result.add(Token.LBrace)
            "}" -> result.add(Token.RBrace)
            "+" -> result.add(Token.Op(OpKind.PLUS))
            "-" -> result.add(Token.Op(OpKind.MINUS))
            "*" -> result.add(Token.Star)
            "=" -> result.add(Token.Equals)
            ";" -> result.add(Token.Semicolon)
            "let" -> result.add(Token.Let)
            "mut" -> result.add(Token.Mut)
            "&" -> result.add(Token.Ref)
            "true" -> result.add(Token.Number(1))
            "false" -> result.add(Token.Number(0))
            else -> {
                if (rawTokens[i].all { it.isLetterOrDigit() } && rawTokens[i].first().isLetter()) {
                    result.add(Token.Identifier(rawTokens[i]))
                } else {
                    val value = rawTokens[i].toIntOrNull()
                        ?: return Result.failure(
                            if (rawTokens[i].length == 1 && !rawTokens[i][0].isLetterOrDigit())
                                EvalError.UnexpectedToken(i, rawTokens[i])
                            else
                                EvalError.NonNumericToken(i, rawTokens[i])
                        )
                    result.add(Token.Number(value))
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
