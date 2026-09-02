package com.tuff

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class EvaluatorTest {
    @Test
    fun `evaluate empty string returns failure`() {
        assertIs<EvalError.EmptyExpression>(evaluate("").exceptionOrNull())
    }

    @Test
    fun `evaluate single digit returns that digit`() {
        assertEquals(1, evaluate("1").getOrThrow())
    }

    @Test
    fun `evaluate addition expression`() {
        assertEquals(3, evaluate("1 + 2").getOrThrow())
    }

    @Test
    fun `evaluate multi-term addition`() {
        assertEquals(6, evaluate("1 + 2 + 3").getOrThrow())
    }

    @Test
    fun `evaluate mixed addition and subtraction`() {
        assertEquals(1, evaluate("2 + 3 - 4").getOrThrow())
    }

    @Test
    fun `evaluate multiplication has precedence over addition`() {
        assertEquals(10, evaluate("2 * 3 + 4").getOrThrow())
    }

    @Test
    fun `evaluate addition before multiplication`() {
        assertEquals(14, evaluate("2 + 3 * 4").getOrThrow())
    }

    @Test
    fun `evaluate parenthesized expression`() {
        assertEquals(20, evaluate("(2 + 3) * 4").getOrThrow())
    }

    @Test
    fun `evaluate non-numeric token returns failure`() {
        assertIs<EvalError.NonNumericToken>(evaluate("abc").exceptionOrNull())
    }

    @Test
    fun `evaluate trailing operator returns failure`() {
        assertIs<EvalError.UnexpectedToken>(evaluate("1 +").exceptionOrNull())
    }

    @Test
    fun `evaluate whitespace only returns failure`() {
        assertIs<EvalError.EmptyExpression>(evaluate("   ").exceptionOrNull())
    }
}
