package com.sirmathhman.tuff

/**
 * Interpret the given input and return a Result<Int, String>.
 * Supports integer literals and simple addition of two integers (e.g. "1 + 2").
 * On parse or unsupported expressions, returns `Result.Err` with an error message.
 */
fun interpret(input: String): Result<Int, String> {
    val trimmed = input.trim()

    // Simple addition "a + b"
    if (trimmed.contains('+')) {
        val parts = trimmed.split('+')
        if (parts.size != 2) return Result.Err("Unsupported expression: $input")
        val left = parts[0].trim().toIntOrNull() ?: return Result.Err("Invalid left operand: ${parts[0].trim()}")
        val right = parts[1].trim().toIntOrNull() ?: return Result.Err("Invalid right operand: ${parts[1].trim()}")
        return Result.Ok(left + right)
    }

    val value = trimmed.toIntOrNull() ?: return Result.Err("Invalid integer: $input")
    return Result.Ok(value)
}
