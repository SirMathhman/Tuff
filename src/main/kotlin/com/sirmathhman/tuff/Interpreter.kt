package com.sirmathhman.tuff

/**
 * Interpret the given input and return a Result<Int, String>.
 * Supports integer literals and chained addition/subtraction of integers (e.g. "10 - 5 + 3").
 * On parse or unsupported expressions, returns `Result.Err` with an error message.
 */
fun interpret(input: String): Result<Int, String> {
    val trimmed = input.trim()
    if (trimmed.isEmpty()) return Result.Err("Empty input")

    // Tokenize numbers and operators (+/-)
    val tokenRegex = Regex("\\d+|[+-]")
    val rawTokens = tokenRegex.findAll(trimmed).map { it.value }.toList()
    if (rawTokens.isEmpty()) return Result.Err("Invalid expression: $input")

    // Build a list of numbers and operators, supporting unary +/- for numbers
    val numbers = mutableListOf<Int>()
    val ops = mutableListOf<String>()

    var i = 0
    // Parse first number (may have leading sign)
    if (rawTokens[i] == "+" || rawTokens[i] == "-") {
        // must be followed by a number
        if (i + 1 >= rawTokens.size || !rawTokens[i + 1].all { it.isDigit() }) {
            return Result.Err("Invalid expression start: ${rawTokens.getOrNull(i)}")
        }
        val sign = rawTokens[i]
        val num = (if (sign == "-") -rawTokens[i + 1].toInt() else rawTokens[i + 1].toInt())
        numbers.add(num)
        i += 2
    } else if (rawTokens[i].all { it.isDigit() }) {
        numbers.add(rawTokens[i].toInt())
        i += 1
    } else {
        return Result.Err("Invalid expression start: ${rawTokens[i]}")
    }

    while (i < rawTokens.size) {
        val op = rawTokens[i]
        if (op != "+" && op != "-") return Result.Err("Unexpected token: $op")
        // next can be number or a sign followed by number
        if (i + 1 >= rawTokens.size) return Result.Err("Missing operand after operator at position ${i + 1}")
        if (rawTokens[i + 1] == "+" || rawTokens[i + 1] == "-") {
            // unary sign before number
            if (i + 2 >= rawTokens.size || !rawTokens[i + 2].all { it.isDigit() }) return Result.Err("Invalid operand after operator $op")
            val sign = rawTokens[i + 1]
            val num = (if (sign == "-") -rawTokens[i + 2].toInt() else rawTokens[i + 2].toInt())
            ops.add(op)
            numbers.add(num)
            i += 3
        } else if (rawTokens[i + 1].all { it.isDigit() }) {
            ops.add(op)
            numbers.add(rawTokens[i + 1].toInt())
            i += 2
        } else {
            return Result.Err("Invalid operand after operator $op")
        }
    }

    // Evaluate left-to-right
    var result = numbers[0]
    for (k in ops.indices) {
        val op = ops[k]
        val n = numbers[k + 1]
        when (op) {
            "+" -> result += n
            "-" -> result -= n
            else -> return Result.Err("Unsupported operator: $op")
        }
    }

    return Result.Ok(result)
}
