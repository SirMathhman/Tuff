package com.tuff

fun evaluate(input: String): Int {
    if (input.isEmpty()) return 0
    val tokens = input.trim().split(" ")

    // Extract numbers and operators
    val numbers = mutableListOf(tokens[0].toInt())
    val operators = mutableListOf<String>()
    for (i in 1 until tokens.size step 2) {
        operators.add(tokens[i])
        numbers.add(tokens[i + 1].toInt())
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
    return result
}
