package com.sirmathhman.tuff

/**
 * Interpret the given input and return an Int result.
 * Currently supports integer literals and simple addition of two integers (e.g. "1 + 2").
 */
fun interpret(input: String): Int {
    val trimmed = input.trim()

    // Simple addition "a + b"
    if (trimmed.contains('+')) {
        val parts = trimmed.split('+')
        if (parts.size != 2) throw IllegalArgumentException("Unsupported expression: $input")
        val left = parts[0].trim().toInt()
        val right = parts[1].trim().toInt()
        return left + right
    }

    return trimmed.toInt()
}
