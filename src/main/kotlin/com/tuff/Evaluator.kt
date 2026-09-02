package com.tuff

fun evaluate(input: String): Result<Int> {
    if (input.isBlank()) return Result.failure(EvalError.EmptyExpression(0))
    val tokens = input.trim().split(" ")

    // Extract numbers and operators
    val numbers = mutableListOf<Int>()
    val operators = mutableListOf<String>()

    for (i in tokens.indices) {
        if (i % 2 == 0) {
            // Expect a number
            val value = tokens[i].toIntOrNull()
                ?: return Result.failure(EvalError.NonNumericToken(i, tokens[i]))
            numbers.add(value)
        } else {
            // Expect an operator
            val op = tokens[i]
            if (op !in listOf("+", "-", "*")) {
                return Result.failure(EvalError.UnexpectedToken(i, op))
            }
            operators.add(op)
        }
    }

    // Must end with a number (odd token count)
    if (tokens.size % 2 == 0) {
        return Result.failure(EvalError.UnexpectedToken(tokens.size - 1, tokens.last()))
    }

    // Pass 1: resolve multiplication
    val multNumbers = mutableListOf(numbers[0])
    val multOps = mutableListOf<String>()
    for (i in 1 until numbers.size) {
        if (operators[i - 1] == "*") {
            multNumbers[multNumbers.size - 1] *= numbers[i]
        } else {
            multOps.add(operators[i - 1])
            multNumbers.add(numbers[i])
        }
    }

    // Pass 2: resolve addition and subtraction left-to-right
    var result = multNumbers[0]
    for (i in 1 until multNumbers.size) {
        result = if (multOps[i - 1] == "+") result + multNumbers[i] else result - multNumbers[i]
    }
    return Result.success(result)
}
