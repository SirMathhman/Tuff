package com.sirmathhman.tuff

/**
 * Interpret the given input and return a Result<Int, String>.
 * Supports integer literals and chained addition of integers (e.g. "1 + 2 + 3").
 * On parse or unsupported expressions, returns `Result.Err` with an error message.
 */
fun interpret(input: String): Result<Int, String> {
    val trimmed = input.trim()

    // Handle chained addition: "a + b + c + ..."
    if (trimmed.contains('+')) {
        val parts = trimmed.split('+').map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.isEmpty()) return Result.Err("Unsupported expression: $input")

        var sum = 0
        parts.forEachIndexed { idx, part ->
            val n = part.toIntOrNull() ?: return Result.Err("Invalid operand at position ${idx + 1}: $part")
            sum += n
        }
        return Result.Ok(sum)
    }

    val value = trimmed.toIntOrNull() ?: return Result.Err("Invalid integer: $input")
    return Result.Ok(value)
}
