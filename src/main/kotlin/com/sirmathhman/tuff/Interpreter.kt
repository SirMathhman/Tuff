package com.sirmathhman.tuff

/**
 * Interpret the given input and return a Result<Int, String>.
 * Supports integer literals and chained addition/subtraction of integers (e.g. "10 - 5 + 3").
 * On parse or unsupported expressions, returns `Result.Err` with an error message.
 */
fun interpret(input: String): Result<Int, String> {
    val trimmed = input.trim()
    if (trimmed.isEmpty()) return Result.Err("Empty input")

    val rawTokens = tokenize(trimmed)
    if (rawTokens.isEmpty()) return Result.Err("Invalid expression: $input")

    val parsed = parseTokens(rawTokens)
    if (parsed is Result.Err) return parsed
    val (numbers, ops) = (parsed as Result.Ok<Pair<List<Int>, List<String>>>).value

    val result = evaluate(numbers, ops)
    return Result.Ok(result)
}

private fun tokenize(input: String): List<String> {
    val tokenRegex = Regex("\\d+|[+-]")
    return tokenRegex.findAll(input).map { it.value }.toList()
}

private const val UNARY_SIGN_OFFSET = 2
private const val BINARY_OPERAND_OFFSET = 1
private const val OP_PLUS = "+"
private const val OP_MINUS = "-"

private fun parseTokens(rawTokens: List<String>): Result<Pair<List<Int>, List<String>>, String> {
    if (rawTokens.isEmpty()) return Result.Err("Empty tokens")

    val numbers = mutableListOf<Int>()
    val ops = mutableListOf<String>()

    var i = 0
    val first = parseFirstNumber(rawTokens, i)
    if (first is Result.Err) return first
    val (firstNum, nextIndex) = (first as Result.Ok<Pair<Int, Int>>).value
    numbers.add(firstNum)
    i = nextIndex

    while (i < rawTokens.size) {
        val parsed = parseOperatorAndOperand(rawTokens, i)
        if (parsed is Result.Err) return parsed
        val (op, num, next) = (parsed as Result.Ok<Triple<String, Int, Int>>).value
        ops.add(op)
        numbers.add(num)
        i = next
    }

    return Result.Ok(Pair(numbers, ops))
}

private fun parseFirstNumber(tokens: List<String>, index: Int): Result<Pair<Int, Int>, String> {
    var i = index
    if (i >= tokens.size) return Result.Err("Missing first operand")

    return if (tokens[i] == OP_PLUS || tokens[i] == OP_MINUS) {
        if (i + 1 >= tokens.size || !tokens[i + 1].all { it.isDigit() }) {
            Result.Err("Invalid expression start: ${tokens.getOrNull(i)}")
        } else {
            val sign = tokens[i]
            val num = if (sign == OP_MINUS) -tokens[i + 1].toInt() else tokens[i + 1].toInt()
            Result.Ok(Pair(num, i + UNARY_SIGN_OFFSET))
        }
    } else if (tokens[i].all { it.isDigit() }) {
        Result.Ok(Pair(tokens[i].toInt(), i + BINARY_OPERAND_OFFSET))
    } else {
        Result.Err("Invalid expression start: ${tokens[i]}")
    }
}

private fun parseOperatorAndOperand(tokens: List<String>, index: Int): Result<Triple<String, Int, Int>, String> {
    val i = index
    val op = tokens[i]
    if (op != OP_PLUS && op != OP_MINUS) return Result.Err("Unexpected token: $op")
    if (i + 1 >= tokens.size) return Result.Err("Missing operand after operator at position ${i + 1}")

    return if (tokens[i + 1] == OP_PLUS || tokens[i + 1] == OP_MINUS) {
        // unary sign before number
        if (i + UNARY_SIGN_OFFSET >= tokens.size || !tokens[i + UNARY_SIGN_OFFSET].all { it.isDigit() }) {
            Result.Err("Invalid operand after operator $op")
        } else {
            val sign = tokens[i + 1]
            val num = if (sign == OP_MINUS) -tokens[i + UNARY_SIGN_OFFSET].toInt() else tokens[i + UNARY_SIGN_OFFSET].toInt()
            Result.Ok(Triple(op, num, i + 3))
        }
    } else if (tokens[i + 1].all { it.isDigit() }) {
        Result.Ok(Triple(op, tokens[i + 1].toInt(), i + 2))
    } else {
        Result.Err("Invalid operand after operator $op")
    }
}

private fun evaluate(numbers: List<Int>, ops: List<String>): Int {
    var result = numbers[0]
    for (k in ops.indices) {
        val op = ops[k]
        val n = numbers[k + 1]
        when (op) {
            "+" -> result += n
            "-" -> result -= n
        }
    }
    return result
}
