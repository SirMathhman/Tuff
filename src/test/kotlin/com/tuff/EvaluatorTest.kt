package com.tuff

import kotlin.test.Test
import kotlin.test.assertEquals

class EvaluatorTest {
    @Test
    fun `evaluate empty string returns 0`() {
        assertEquals(0, evaluate(""))
    }

    @Test
    fun `evaluate single digit returns that digit`() {
        assertEquals(1, evaluate("1"))
    }

    @Test
    fun `evaluate addition expression`() {
        assertEquals(3, evaluate("1 + 2"))
    }

    @Test
    fun `evaluate multi-term addition`() {
        assertEquals(6, evaluate("1 + 2 + 3"))
    }

    @Test
    fun `evaluate mixed addition and subtraction`() {
        assertEquals(1, evaluate("2 + 3 - 4"))
    }
}
