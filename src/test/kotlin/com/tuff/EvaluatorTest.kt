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
    fun `evaluate true literal returns one`() {
        assertEquals(1, evaluate("let x = true; x").getOrThrow())
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
    fun `evaluate multiple let bindings in braced block`() {
        assertEquals(20, evaluate("{ let x = 2 + 3; let y = x; y } * 4").getOrThrow())
    }

    @Test
    fun `evaluate top-level let with nested braced block`() {
        assertEquals(20, evaluate("let z = { let x = 2 + 3; let y = x; y } * 4; z").getOrThrow())
    }

    @Test
    fun `evaluate mutable variable with assignment`() {
        assertEquals(1, evaluate("let mut x = 0; x = 1; x").getOrThrow())
    }

    @Test
    fun `evaluate mutable variable with assignment in braced block`() {
        assertEquals(1, evaluate("let mut x = 0; { x = 1; } x").getOrThrow())
    }

    @Test
    fun `evaluate reference and dereference`() {
        assertEquals(1, evaluate("let x = 1; let y = &x; *y").getOrThrow())
    }

    @Test
    fun `evaluate mutable reference write-through`() {
        assertEquals(1, evaluate("let mut x = 0; let y = &mut x; *y = 1; x").getOrThrow())
    }

    @Test
    fun `evaluate write-through via immutable reference fails`() {
        assertIs<EvalError.WriteThroughImmutableReference>(
            evaluate("let mut x = 0; let y = &x; *y = 1; x").exceptionOrNull()
        )
    }

    @Test
    fun `evaluate write-through to undeclared reference fails`() {
        assertIs<EvalError.UnknownVariable>(
            evaluate("let mut x = 0; *y = 1; x").exceptionOrNull()
        )
    }

    @Test
    fun `evaluate dereference reads live pointee value`() {
        assertEquals(5, evaluate("let mut x = 0; let y = &mut x; x = 5; *y").getOrThrow())
    }

    @Test
    fun `evaluate assignment to immutable binding fails`() {
        assertIs<EvalError.AssignmentToImmutable>(
            evaluate("let x = 0; x = 1; x").exceptionOrNull()
        )
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

    @Test
    fun `evaluate variable declared in braced block does not leak`() {
        assertIs<EvalError.UnknownVariable>(
            evaluate("{ let x = 1; x } + x").exceptionOrNull()
        )
    }

    @Test
    fun `evaluate nested block can read outer variable`() {
        assertEquals(5, evaluate("let x = 5; { x }").getOrThrow())
    }

    @Test
    fun `evaluate nested block can assign outer mutable variable`() {
        assertEquals(3, evaluate("let mut x = 1; { x = 3; } x").getOrThrow())
    }

    @Test
    fun `evaluate logical or with true and false`() {
        assertEquals(1, evaluate("let x = true; let y = false; x || y").getOrThrow())
    }

    @Test
    fun `evaluate equality with different values`() {
        assertEquals(0, evaluate("let x = 1; let y = 2; x == y").getOrThrow())
    }
}
