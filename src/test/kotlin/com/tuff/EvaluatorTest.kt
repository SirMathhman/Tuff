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
    fun `evaluate braced expression`() {
        assertEquals(20, evaluate("{ 2 + 3 } * 4").getOrThrow())
    }

    @Test
    fun `evaluate let binding in braced block`() {
        assertEquals(20, evaluate("{ let x = 2 + 3; x } * 4").getOrThrow())
    }

    @Test
    fun `evaluate unknown variable returns failure`() {
        assertIs<EvalError.UnknownVariable>(evaluate("abc").exceptionOrNull())
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
