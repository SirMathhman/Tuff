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
    // Support numbers, operators + - * /, and parentheses
    val tokenRegex = Regex("""\d+|[+\-*/()]""")
    return tokenRegex.findAll(input).map { it.value }.toList()
}

private const val UNARY_SIGN_OFFSET = 2
private const val BINARY_OPERAND_OFFSET = 1
private const val OP_PLUS = "+"
private const val OP_MINUS = "-"

private fun parseTokens(rawTokens: List<String>): Result<Pair<List<Int>, List<String>>, String> {
    // Normalize unary signs attached to numbers (we only support unary sign directly before a number)
    val tokens = normalizeUnarySigns(rawTokens) ?: return Result.Err("Unsupported unary sign usage")

    val rpnResult = infixToRpn(tokens)
    if (rpnResult is Result.Err) return Result.Err((rpnResult as Result.Err).error)
    val rpn = (rpnResult as Result.Ok<List<String>>).value

    val evalResult = evalRpn(rpn)
    return if (evalResult is Result.Err) evalResult else Result.Ok(Pair(listOf((evalResult as Result.Ok).value), emptyList()))
}

private fun normalizeUnarySigns(tokens: List<String>): List<String>? {
    val out = mutableListOf<String>()
    var i = 0
    while (i < tokens.size) {
        val t = tokens[i]
        if ((t == OP_PLUS || t == OP_MINUS) && (out.isEmpty() || out.last() == "(" || out.last() == OP_PLUS || out.last() == OP_MINUS || out.last() == "*" || out.last() == "/")) {
            // Unary sign; next token must be a number
            if (i + 1 < tokens.size && tokens[i + 1].all { it.isDigit() }) {
                val signed = if (t == OP_MINUS) "-${tokens[i + 1]}" else tokens[i + 1]
                out.add(signed)
                i += 2
                continue
            } else {
                return null
            }
        } else {
            out.add(t)
            i += 1
        }
    }
    return out
}

private fun infixToRpn(tokens: List<String>): Result<List<String>, String> {
    val output = mutableListOf<String>()
    val ops = java.util.ArrayDeque<String>()

    fun precedence(op: String) = when (op) {
        "*", "/" -> 2
        "+", "-" -> 1
        else -> 0
    }

    for (t in tokens) {
        if (t.matches(Regex("-?\\d+"))) {
            output.add(t)
        } else if (t == "+" || t == "-" || t == "*" || t == "/") {
            while (ops.isNotEmpty() && ops.peek() != "(" && precedence(ops.peek()) >= precedence(t)) {
                output.add(ops.pop())
            }
            ops.push(t)
        } else if (t == "(") {
            ops.push(t)
        } else if (t == ")") {
            while (ops.isNotEmpty() && ops.peek() != "(") {
                output.add(ops.pop())
            }
            if (ops.isEmpty() || ops.peek() != "(") return Result.Err("Mismatched parentheses")
            ops.pop()
        } else {
            return Result.Err("Unknown token: $t")
        }
    }

    while (ops.isNotEmpty()) {
        val op = ops.pop()
        if (op == "(" || op == ")") return Result.Err("Mismatched parentheses")
        output.add(op)
    }

    return Result.Ok(output)
}

private fun evalRpn(rpn: List<String>): Result<Int, String> {
    val stack = java.util.ArrayDeque<Int>()
    for (t in rpn) {
        if (t.matches(Regex("-?\\d+"))) {
            stack.push(t.toInt())
        } else if (t == "+" || t == "-" || t == "*" || t == "/") {
            if (stack.size < 2) return Result.Err("Invalid RPN expression")
            val b = stack.pop()
            val a = stack.pop()
            val res = when (t) {
                "+" -> a + b
                "-" -> a - b
                "*" -> a * b
                "/" -> if (b == 0) return Result.Err("Division by zero") else a / b
                else -> return Result.Err("Unsupported operator: $t")
            }
            stack.push(res)
        } else {
            return Result.Err("Unknown RPN token: $t")
        }
    }
    if (stack.size != 1) return Result.Err("Invalid RPN evaluation")
    return Result.Ok(stack.pop())
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
    // accept +, -, * and /
    if (op != OP_PLUS && op != OP_MINUS && op != "*" && op != "/") return Result.Err("Unexpected token: $op")
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
    // First handle * and / with higher precedence
    val nums = ArrayList<Int>()
    val newOps = ArrayList<String>()

    nums.add(numbers[0])
    for (i in ops.indices) {
        val op = ops[i]
        val next = numbers[i + 1]
        if (op == "*") {
            nums[nums.lastIndex] = nums[nums.lastIndex] * next
        } else if (op == "/") {
            nums[nums.lastIndex] = nums[nums.lastIndex] / next
        } else {
            newOps.add(op)
            nums.add(next)
        }
    }

    // Now evaluate + and - left-to-right
    var result = nums[0]
    for (k in newOps.indices) {
        val op = newOps[k]
        val n = nums[k + 1]
        when (op) {
            "+" -> result += n
            "-" -> result -= n
            else -> {} // should not reach here
        }
    }
    return result
}
