package com.tuff

fun evaluate(input: String): Int {
    if (input.isEmpty()) return 0
    val tokens = input.trim().split(" ")
    var result = tokens[0].toInt()
    var i = 1
    while (i < tokens.size) {
        val op = tokens[i]
        val value = tokens[i + 1].toInt()
        result = if (op == "+") result + value else result - value
        i += 2
    }
    return result
}
