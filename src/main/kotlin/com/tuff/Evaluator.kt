package com.tuff

fun evaluate(input: String): Result<Int> {
    return tokenize(input).fold(
        onSuccess = { evaluate(it) },
        onFailure = { Result.failure(it) }
    )
}

fun evaluate(tokens: List<Token>): Result<Int> {
    // Extract numbers and operators
    val numbers = mutableListOf<Int>()
    val operators = mutableListOf<OpKind>()

    for (token in tokens) {
        when (token) {
            is Token.Number -> numbers.add(token.value)
            is Token.Op -> operators.add(token.kind)
        }
    }

    // Pass 1: resolve multiplication
    val multNumbers = mutableListOf(numbers[0])
    val multOps = mutableListOf<OpKind>()
    for (i in 1 until numbers.size) {
        if (operators[i - 1] == OpKind.MULTIPLY) {
            multNumbers[multNumbers.size - 1] *= numbers[i]
        } else {
            multOps.add(operators[i - 1])
            multNumbers.add(numbers[i])
        }
    }

    // Pass 2: resolve addition and subtraction left-to-right
    var result = multNumbers[0]
    for (i in 1 until multNumbers.size) {
        result = if (multOps[i - 1] == OpKind.PLUS) result + multNumbers[i] else result - multNumbers[i]
    }
    return Result.success(result)
}
