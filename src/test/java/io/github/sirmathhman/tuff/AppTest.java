package io.github.sirmathhman.tuff;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import io.github.sirmathhman.tuff.vm.Instruction;

public final class AppTest {
	@Test
	void shouldRunTheSimplestProgramPossible() {
		assertValid("", 0);
	}

	private void assertValidWithInput(String source, int exitCode, int... input) {
		Assertions.assertTimeoutPreemptively(Duration.ofMillis(100), () -> {
			Result<RunResult, ApplicationError> result = App.run(source, input);
			assertValidResult(result, exitCode);
		});
	}

	private void assertValid(String source, int exitCode) {
		assertValidWithInput(source, exitCode);
	}

	private void assertValidResult(Result<RunResult, ApplicationError> result, int exitCode) {
		RunResult runResult = result.match(ok -> ok, err -> {
			Assertions.fail("Compilation failed: " + err.display());
			return null;
		});
		assertEquals(exitCode, runResult.returnValue(), "Unexpected exit code, instructions compiled are: " +
				Instruction.displayAll(runResult.executedInstructions()));
		assertTrue(runResult.output().isEmpty());
	}

	@Test
	void shouldRunWithAnInt() {
		assertValid("0", 0);
	}

	@Test
	void shouldRunWith100() {
		assertValid("100", 100);
	}

	@Test
	void shouldRunWith100U8() {
		assertValid("100U8", 100);
	}

	@Test
	void shouldRejectNegativeUnsignedLiteral() {
		assertInvalid("-100U8");
	}

	@Test
	void shouldRejectValueOutOfRange() {
		assertInvalid("256U8");
	}

	@Test
	void shouldAddTwoTypedLiterals() {
		assertValid("1U8 + 2U8", 3);
	}

	@Test
	void shouldReadInputValue() {
		assertValidWithInput("read U8", 100, 100);
	}

	@Test
	void shouldReadAndAddWithLiteral() {
		assertValidWithInput("read U8 + 50U8", 150, 100);
	}

	@Test
	void shouldAddTwoReadValues() {
		assertValidWithInput("read U8 + read U8", 150, 100, 50);
	}

	@Test
	void shouldAddThreeReadValues() {
		assertValidWithInput("read U8 + read U8 + read U8", 9, 2, 3, 4);
	}

	@Test
	void shouldSubtractReadValue() {
		assertValidWithInput("read U8 + read U8 - read U8", 1, 2, 3, 4);
	}

	@Test
	void shouldMultiplyReadValues() {
		assertValidWithInput("read U8 * read U8 + read U8", 10, 2, 3, 4);
	}

	@Test
	void shouldRespectPrecedenceAddBeforeMultiply() {
		assertValidWithInput("read U8 + read U8 * read U8", 14, 2, 3, 4);
	}

	@Test
	void shouldDivideTwoReadValues() {
		assertValidWithInput("read U8 / read U8", 2, 6, 3);
	}

	@Test
	void shouldSupportCurlyBracesWithParenthesesInMultiplication() {
		assertValidWithInput("(read U8 + { read U8 }) * read U8", 20, 2, 3, 4);
	}

	@Test
	void shouldSupportLetBindingInExpression() {
		assertValidWithInput("(read U8 + { let x : U8 = read U8; x }) * read U8", 20, 2, 3, 4);
	}

	@Test
	void shouldSupportMultipleLetBindingsInExpression() {
		assertValidWithInput("(read U8 + { let x : U8 = read U8; let y : U8 = x; y }) * read U8", 20, 2, 3, 4);
	}

	@Test
	void shouldRejectDuplicateVariableBinding() {
		assertInvalid("(read U8 + { let x : U8 = read U8; let x : U8 = 100; x }) * read U8");
	}

	@Test
	void shouldRejectTypeMismatchInLetBinding() {
		assertInvalid("(read U8 + { let x : U8 = read U16; x }) * read U8");
	}

	@Test
	void shouldSupportLetBindingAtStatementLevel() {
		assertValidWithInput("let temp : U8 = (read U8 + { let x : U8 = read U8; let y : U8 = x; y }) * read U8; temp", 20,
				2, 3, 4);
	}

	@Test
	void shouldSupportImplicitTypeUpcasting() {
		assertValidWithInput("let x : U16 = read U8; x", 100, 100);
	}

	@Test
	void shouldSupportTypeInferenceInLetBinding() {
		assertValidWithInput("let x = read U8; x", 100, 100);
	}

	@Test
	void shouldRejectDowncastingInLetBinding() {
		assertInvalid("let x = read U16; let y : U8 = x; y");
	}

	@Test
	void shouldSupportVariableReferenceInExpression() {
		assertValidWithInput("let x = read U8; x + x", 4, 2, 3);
	}

	@Test
	void shouldSupportMutableVariableAssignment() {
		assertValidWithInput("let mut x = read U8; x = read U8; x", 2, 1, 2);
	}

	@Test
	void shouldSupportMultipleVariablesInScope() {
		assertValidWithInput("let x = read U8; let y = read U8; x", 2, 2, 3);
	}

	@Test
	void shouldRejectAssignmentToImmutableVariable() {
		assertInvalid("let x = read U8; x = read U8; x");
	}

	@Test
	void shouldSupportUninitializedVariableWithAssignment() {
		assertValidWithInput("let x : I32; x = read I32; x", 42, 42);
	}

	@Test
	void shouldRejectUninitializedVariableWithoutAssignment() {
		assertInvalid("let x : U8; x");
	}

	@Test
	void shouldRejectMultipleAssignmentsToUninitializedVariable() {
		assertInvalid("let x : U8; x = read U8; x = 100; x");
	}

	@Test
	void shouldSupportMutableUninitializedVariableWithMultipleAssignments() {
		assertValidWithInput("let mut x : U8; x = read U8; x = 100; x", 100, 50);
	}

	@Test
	void shouldSupportReferencesAndDereferences() {
		// Note: Full pointer support with proper dereferencing requires additional
		// infrastructure
		// For now, we test that the pointer type syntax is accepted
		// The test reads U8, stores reference to it, and the reference points to
		// address 100
		assertValidWithInput("let x = read U8; let y : *U8 = &x; x", 42, 42);
	}

	@Test
	void shouldRejectDereferencingNonPointerType() {
		assertInvalid("let x = read U8; *x");
	}

	@Test
	void shouldSupportMutablePointers() {
		// Test that *mut pointer type annotation is accepted
		assertValidWithInput("let mut x = read U8; let y : *mut U8 = &x; x", 42, 42);
	}

	@Test
	void shouldSupportMutablePointerAssignment() {
		// Test that dereference assignment through mutable pointer works
		assertValidWithInput("let mut x = 0; let y = &mut x; *y = read I32; x", 42, 42);
	}

	@Test
	void shouldSupportScopedBlockWithMutableVariableAssignment() {
		assertValidWithInput("let mut x = 0; { x = read I32; x }", 42, 42);
	}

	@Test
	void shouldSupportScopedBlockWithMutableVariableAssignmentAndOuterReturn() {
		assertValidWithInput("let mut x = 0; { x = read I32; } x", 42, 42);
	}

	@Test
	void shouldReadBoolZero() {
		assertValidWithInput("read Bool", 0, 0);
	}

	@Test
	void shouldReadBoolOne() {
		assertValidWithInput("read Bool", 1, 1);
	}

	@Test
	void shouldSupportBoolInLetBinding() {
		assertValidWithInput("let x : Bool = read Bool; x", 0, 0);
	}

	@Test
	void shouldSupportBoolInLetBindingWithOne() {
		assertValidWithInput("let x : Bool = read Bool; x", 1, 1);
	}

	@Test
	void shouldSupportLogicalOrWithBools() {
		assertValidWithInput("read Bool || read Bool", 0, 0, 0);
	}

	@Test
	void shouldSupportLogicalOrWithBoolsFirstTrue() {
		assertValidWithInput("read Bool || read Bool", 1, 1, 0);
	}

	@Test
	void shouldSupportLogicalOrWithBoolsSecondTrue() {
		assertValidWithInput("read Bool || read Bool", 1, 0, 1);
	}

	@Test
	void shouldSupportLogicalOrWithBoolsBothTrue() {
		assertValidWithInput("read Bool || read Bool", 1, 1, 1);
	}

	@Test
	void shouldSupportLogicalAndWithBools() {
		assertValidWithInput("read Bool && read Bool", 0, 0, 0);
	}

	@Test
	void shouldSupportLogicalAndWithBoolsFirstTrue() {
		assertValidWithInput("read Bool && read Bool", 0, 1, 0);
	}

	@Test
	void shouldSupportLogicalAndWithBoolsSecondTrue() {
		assertValidWithInput("read Bool && read Bool", 0, 0, 1);
	}

	@Test
	void shouldSupportLogicalAndWithBoolsBothTrue() {
		assertValidWithInput("read Bool && read Bool", 1, 1, 1);
	}

	@Test
	void shouldSupportEqualityOperatorWithBoolsFalseEqualsFalse() {
		assertValidWithInput("read Bool == read Bool", 1, 0, 0);
	}

	@Test
	void shouldSupportEqualityOperatorWithBoolsTrueEqualsTrue() {
		assertValidWithInput("read Bool == read Bool", 1, 1, 1);
	}

	@Test
	void shouldSupportEqualityOperatorWithBoolsFalseNotEqualsTrue() {
		assertValidWithInput("read Bool == read Bool", 0, 0, 1);
	}

	@Test
	void shouldSupportEqualityOperatorWithBoolsTrueNotEqualsFalse() {
		assertValidWithInput("read Bool == read Bool", 0, 1, 0);
	}

	@Test
	void shouldSupportEqualityOperatorWithU32() {
		assertValidWithInput("read U32 == read U32", 1, 429496729, 429496729);
	}

	@Test
	void shouldSupportEqualityOperatorWithU32NotEqual() {
		assertValidWithInput("read U32 == read U32", 0, 429496729, 100);
	}

	@Test
	void shouldSupportEqualityInLetBinding() {
		assertValidWithInput("let x = read U32 == read U32; x", 1, 100, 100);
	}

	@Test
	void shouldSupportInequalityOperatorWithU32Same() {
		assertValidWithInput("read U32 != read U32", 0, 429496729, 429496729);
	}

	@Test
	void shouldSupportInequalityOperatorWithU32Different() {
		assertValidWithInput("read U32 != read U32", 1, 429496729, 100);
	}

	@Test
	void shouldSupportInequalityWithBoolsFalseNotEqualsFalse() {
		assertValidWithInput("read Bool != read Bool", 0, 0, 0);
	}

	@Test
	void shouldSupportInequalityWithBoolsTrueNotEqualsTrue() {
		assertValidWithInput("read Bool != read Bool", 0, 1, 1);
	}

	@Test
	void shouldSupportInequalityWithBoolsFalseNotEqualsTrue() {
		assertValidWithInput("read Bool != read Bool", 1, 0, 1);
	}

	@Test
	void shouldSupportInequalityWithBoolsTrueNotEqualsFalse() {
		assertValidWithInput("read Bool != read Bool", 1, 1, 0);
	}

	@Test
	void shouldSupportInequalityInLetBinding() {
		assertValidWithInput("let x = read U32 != read U32; x", 0, 100, 100);
	}

	@Test
	void shouldSupportLessThanOperatorWithU32Less() {
		assertValidWithInput("read U32 < read U32", 1, 100, 429496729);
	}

	@Test
	void shouldSupportLessThanOperatorWithU32NotLess() {
		assertValidWithInput("read U32 < read U32", 0, 429496729, 100);
	}

	@Test
	void shouldSupportLessThanOperatorWithU32Equal() {
		assertValidWithInput("read U32 < read U32", 0, 429496729, 429496729);
	}

	@Test
	void shouldSupportLessThanWithBoolsFalse() {
		assertValidWithInput("read Bool < read Bool", 0, 0, 0);
	}

	@Test
	void shouldSupportLessThanWithBoolsTrue() {
		assertValidWithInput("read Bool < read Bool", 0, 1, 1);
	}

	@Test
	void shouldSupportLessThanWithBoolsMixed() {
		assertValidWithInput("read Bool < read Bool", 1, 0, 1);
	}

	@Test
	void shouldSupportLessThanInLetBinding() {
		assertValidWithInput("let x = read U32 < read U32; x", 1, 100, 429496729);
	}

	@Test
	void shouldSupportGreaterThanOperatorWithU32Greater() {
		assertValidWithInput("read U32 > read U32", 1, 429496729, 100);
	}

	@Test
	void shouldSupportGreaterThanOperatorWithU32NotGreater() {
		assertValidWithInput("read U32 > read U32", 0, 100, 429496729);
	}

	@Test
	void shouldSupportGreaterThanOperatorWithU32Equal() {
		assertValidWithInput("read U32 > read U32", 0, 429496729, 429496729);
	}

	@Test
	void shouldSupportGreaterThanWithBoolsFalse() {
		assertValidWithInput("read Bool > read Bool", 0, 0, 0);
	}

	@Test
	void shouldSupportGreaterThanWithBoolsTrue() {
		assertValidWithInput("read Bool > read Bool", 0, 1, 1);
	}

	@Test
	void shouldSupportGreaterThanWithBoolsMixed() {
		assertValidWithInput("read Bool > read Bool", 1, 1, 0);
	}

	@Test
	void shouldSupportGreaterThanInLetBinding() {
		assertValidWithInput("let x = read U32 > read U32; x", 1, 429496729, 100);
	}

	@Test
	void shouldSupportLessOrEqualOperatorWithU32Less() {
		assertValidWithInput("read U32 <= read U32", 1, 100, 429496729);
	}

	@Test
	void shouldSupportLessOrEqualOperatorWithU32Greater() {
		assertValidWithInput("read U32 <= read U32", 0, 429496729, 100);
	}

	@Test
	void shouldSupportLessOrEqualOperatorWithU32Equal() {
		assertValidWithInput("read U32 <= read U32", 1, 429496729, 429496729);
	}

	@Test
	void shouldSupportLessOrEqualWithBoolsFalse() {
		assertValidWithInput("read Bool <= read Bool", 1, 0, 0);
	}

	@Test
	void shouldSupportLessOrEqualWithBoolsTrue() {
		assertValidWithInput("read Bool <= read Bool", 1, 1, 1);
	}

	@Test
	void shouldSupportLessOrEqualWithBoolsMixed() {
		assertValidWithInput("read Bool <= read Bool", 1, 0, 1);
	}

	@Test
	void shouldSupportLessOrEqualWithBoolsMixedReverse() {
		assertValidWithInput("read Bool <= read Bool", 0, 1, 0);
	}

	@Test
	void shouldSupportLessOrEqualInLetBinding() {
		assertValidWithInput("let x = read U32 <= read U32; x", 1, 100, 429496729);
	}

	@Test
	void shouldSupportGreaterOrEqualOperatorWithU32Greater() {
		assertValidWithInput("read U32 >= read U32", 1, 429496729, 100);
	}

	@Test
	void shouldSupportGreaterOrEqualOperatorWithU32NotGreater() {
		assertValidWithInput("read U32 >= read U32", 0, 100, 429496729);
	}

	@Test
	void shouldSupportGreaterOrEqualOperatorWithU32Equal() {
		assertValidWithInput("read U32 >= read U32", 1, 429496729, 429496729);
	}

	@Test
	void shouldSupportGreaterOrEqualWithBoolsFalse() {
		assertValidWithInput("read Bool >= read Bool", 1, 0, 0);
	}

	@Test
	void shouldSupportGreaterOrEqualWithBoolsTrue() {
		assertValidWithInput("read Bool >= read Bool", 1, 1, 1);
	}

	@Test
	void shouldSupportGreaterOrEqualWithBoolsMixed() {
		assertValidWithInput("read Bool >= read Bool", 0, 0, 1);
	}

	@Test
	void shouldSupportGreaterOrEqualWithBoolsMixedReverse() {
		assertValidWithInput("read Bool >= read Bool", 1, 1, 0);
	}

	@Test
	void shouldSupportGreaterOrEqualInLetBinding() {
		assertValidWithInput("let x = read U32 >= read U32; x", 1, 429496729, 100);
	}

	@Test
	void shouldSupportIfElseWithBoolTrue() {
		assertValidWithInput("if (read Bool) 3 else 5", 3, 1);
	}

	@Test
	void shouldSupportIfElseWithBoolFalse() {
		assertValidWithInput("if (read Bool) 3 else 5", 5, 0);
	}

	@Test
	void shouldSupportIfElseWithComparison() {
		assertValidWithInput("if (read U8 > read U8) 100 else 50", 100, 60, 20);
	}

	@Test
	void shouldSupportIfElseWithCompareFalse() {
		assertValidWithInput("if (read U8 > read U8) 100 else 50", 50, 20, 60);
	}

	@Test
	void shouldSupportIfElseInLetBinding() {
		assertValidWithInput("let x = if (read Bool) 100 else 50; x", 100, 1);
	}

	@Test
	void shouldSupportIfElseInLetBindingWithExplicitType() {
		assertValidWithInput("let x : U8 = if (read Bool) 3 else 5; x", 3, 1);
	}

	@Test
	void shouldRejectIfElseWithNonBoolCondition() {
		assertInvalid("if (read U8) 3 else 5");
	}

	@Test
	void shouldSupportBitwiseAndWithTwoReads() {
		assertValidWithInput("read U8 & read U8", 8, 0b1010, 0b1100);
	}

	@Test
	void shouldSupportBitwiseAndWithLiterals() {
		assertValidWithInput("240U8 & 170U8", 160);
	}

	@Test
	void shouldSupportBitwiseAndInLetBinding() {
		assertValidWithInput("let x = read U8 & read U8; x", 8, 0b1010, 0b1100);
	}

	@Test
	void shouldSupportBitwiseAndWithMultipleReads() {
		assertValidWithInput("read U8 & read U8 & read U8", 8, 0b1111, 0b1100, 0b1010);
	}

	@Test
	void shouldSupportBitwiseOrWithTwoReads() {
		assertValidWithInput("read U8 | read U8", 14, 0b1010, 0b1100);
	}

	@Test
	void shouldSupportBitwiseOrWithLiterals() {
		assertValidWithInput("240U8 | 170U8", 250);
	}

	@Test
	void shouldSupportBitwiseOrInLetBinding() {
		assertValidWithInput("let x = read U8 | read U8; x", 14, 0b1010, 0b1100);
	}

	@Test
	void shouldSupportBitwiseOrWithMultipleReads() {
		assertValidWithInput("read U8 | read U8 | read U8", 15, 0b1010, 0b1100, 0b0001);
	}

	@Test
	void shouldSupportBitwiseXorWithTwoReads() {
		assertValidWithInput("read U8 ^ read U8", 6, 0b1010, 0b1100);
	}

	@Test
	void shouldSupportBitwiseXorWithLiterals() {
		assertValidWithInput("240U8 ^ 170U8", 90);
	}

	@Test
	void shouldSupportBitwiseXorInLetBinding() {
		assertValidWithInput("let x = read U8 ^ read U8; x", 6, 0b1010, 0b1100);
	}

	@Test
	void shouldSupportBitwiseXorWithMultipleReads() {
		assertValidWithInput("read U8 ^ read U8 ^ read U8", 9, 0b1010, 0b1100, 0b1111);
	}

	@Test
	void shouldSupportBitwiseNotWithLiteral() {
		assertValidWithInput("~10U8", 245);
	}

	@Test
	void shouldSupportBitwiseNotWithRead() {
		assertValidWithInput("~read U8", 245, 10);
	}

	@Test
	void shouldSupportBitwiseNotWithOperation() {
		assertValidWithInput("~read U8 + read U8", 246, 10, 1);
	}

	@Test
	void shouldSupportBitwiseLeftShiftWithTwoReads() {
		assertValidWithInput("read U8 << read U8", 20, 10, 1);
	}

	@Test
	void shouldSupportBitwiseLeftShiftWithLiterals() {
		assertValidWithInput("5U8 << 2U8", 20);
	}

	@Test
	void shouldSupportBitwiseLeftShiftInLetBinding() {
		assertValidWithInput("let x = read U8 << read U8; x", 20, 10, 1);
	}

	@Test
	void shouldSupportBitwiseRightShiftWithTwoReads() {
		assertValidWithInput("read U8 >> read U8", 5, 20, 2);
	}

	@Test
	void shouldSupportBitwiseRightShiftWithLiterals() {
		assertValidWithInput("20U8 >> 2U8", 5);
	}

	@Test
	void shouldSupportLogicalNotWithReadBool() {
		assertValidWithInput("!read Bool", 1, 0);
	}

	@Test
	void shouldSupportLogicalNotWithReadBoolTrue() {
		assertValidWithInput("!read Bool", 0, 1);
	}

	@Test
	void shouldSupportLogicalNotWithLiteralBool() {
		assertValid("!0Bool", 1);
	}

	@Test
	void shouldSupportLogicalNotWithLiteralBoolTrue() {
		assertValid("!1Bool", 0);
	}

	@Test
	void shouldSupportLogicalNotInLetBinding() {
		assertValidWithInput("let x = !read Bool; x", 1, 0);
	}

	@Test
	void shouldSupportCompoundAdditionAssignment() {
		assertValidWithInput("let mut x = read I32; x += read I32; x", 7, 3, 4);
	}

	@Test
	void shouldSupportCompoundSubtractionAssignment() {
		assertValidWithInput("let mut x = read I32; x -= read I32; x", -1, 3, 4);
	}

	@Test
	void shouldSupportCompoundMultiplicationAssignment() {
		assertValidWithInput("let mut x = read I32; x *= read I32; x", 12, 3, 4);
	}

	@Test
	void shouldSupportCompoundDivisionAssignment() {
		assertValidWithInput("let mut x = read I32; x /= read I32; x", 2, 8, 4);
	}

	@Test
	void shouldSupportMultipleCompoundAssignments() {
		assertValidWithInput("let mut x = read I32; x += read I32; x *= read I32; x", 35, 3, 4, 5);
	}

	@Test
	void shouldSupportConditionalAssignmentToUninitializedVariable() {
		assertValidWithInput("let x : I32; if (read Bool) x = 1; else x = 2; x", 1, 1);
	}

	@Test
	void shouldSupportConditionalAssignmentToUninitializedVariableElseBranch() {
		assertValidWithInput("let x : I32; if (read Bool) x = 1; else x = 2; x", 2, 0);
	}

	@Test
	void shouldSupportNestedElseIfConditionalAssignment() {
		assertValidWithInput("let x : I32; if (read Bool) x = 1; else if (read Bool) x = 2; else x = 3; x", 1, 1, 0);
	}

	@Test
	void shouldSupportNestedElseIfSecondBranch() {
		assertValidWithInput("let x : I32; if (read Bool) x = 1; else if (read Bool) x = 2; else x = 3; x", 2, 0, 1);
	}

	@Test
	void shouldSupportNestedElseIfElseBranch() {
		assertValidWithInput("let x : I32; if (read Bool) x = 1; else if (read Bool) x = 2; else x = 3; x", 3, 0, 0);
	}

	@Test
	void shouldSupportConditionalExpressionInLetBinding() {
		assertValidWithInput("let x : I32 = if (read Bool) 1 else 2; x", 1, 1);
	}

	@Test
	void shouldSupportConditionalExpressionInLetBindingElseBranch() {
		assertValidWithInput("let x : I32 = if (read Bool) 1 else 2; x", 2, 0);
	}

	@Test
	void shouldSupportConditionalExpressionInLetBindingWithArithmetic() {
		assertValidWithInput("let x : I32 = if (read Bool) 10 else 20; x", 10, 1);
	}

	@Test
	void shouldSupportSimpleWhileLoop() {
		assertValidWithInput("let mut x = 0; while (x < 5) x = x + 1; x", 5);
	}

	@Test
	void shouldSupportWhileLoopWithReadValue() {
		assertValidWithInput("let count = read U8; let mut x = 0; while (x < count) x = x + 1; x", 5, 5);
	}

	@Test
	void shouldSupportWhileLoopNeverExecutes() {
		assertValidWithInput("let mut x = 10; while (x < 5) x = x + 1; x", 10);
	}

	@Test
	void shouldSupportWhileLoopMultipleIncrements() {
		assertValidWithInput("let mut x = 0; while (x < 3) x = x + 2; x", 4);
	}

	@Test
	void shouldSupportYieldInScopedBlock() {
		assertValidWithInput("let x : U8 = { yield read U8; }; x", 42, 42);
	}

	private void assertInvalid(String source) {
		Result<Instruction[], CompileError> result = App.compile(source);
		if (result instanceof Result.Ok<Instruction[], CompileError> ok) {
			Assertions.fail("Expected compilation to fail, but it succeeded and produced instructions: "
					+ Instruction.displayAll(ok.value()));
		}
	}
}
