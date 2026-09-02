package com.tuff

fun evaluate(input: String): Int {
    if (input.isEmpty()) return 0
    return input.split("+").map { it.trim().toInt() }.sum()
}
