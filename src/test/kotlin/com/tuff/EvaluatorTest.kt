package com.tuff

import kotlin.test.Test
import kotlin.test.assertEquals

class EvaluatorTest {
    @Test
    fun `evaluate empty string returns 0`() {
        assertEquals(0, evaluate(""))
    }
}
