package com.tuff

fun tokenize(input: String): Result<List<Token>> {
    if (input.isBlank()) return Result.failure(EvalError.EmptyExpression(0))
    val tokens = input.trim().split(" ")

    val result = mutableListOf<Token>()

    for (i in tokens.indices) {
        if (i % 2 == 0) {
            val value = tokens[i].toIntOrNull()
                ?: return Result.failure(EvalError.NonNumericToken(i, tokens[i]))
            result.add(Token.Number(value))
        } else {
            val op = tokens[i]
            val kind = when (op) {
                "+" -> OpKind.PLUS
                "-" -> OpKind.MINUS
                "*" -> OpKind.MULTIPLY
                else -> return Result.failure(EvalError.UnexpectedToken(i, op))
            }
            result.add(Token.Op(kind))
        }
    }

    if (tokens.size % 2 == 0) {
        return Result.failure(EvalError.UnexpectedToken(tokens.size - 1, tokens.last()))
    }

    return Result.success(result)
}
