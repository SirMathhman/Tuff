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
}
