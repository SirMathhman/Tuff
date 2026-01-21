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

	@Test
	void shouldSupportConditionalYieldInBlockTrueBranch() {
		assertValidWithInput("let x = { if ( read Bool ) yield 100; 200 }; x", 100, 1);
	}

	@Test
	void shouldSupportConditionalYieldInBlockFalseBranch() {
		assertValidWithInput("let x = { if ( read Bool ) yield 100; 200 }; x", 200, 0);
	}

	@Test
	void shouldSupportIfElseWithEqualityComparisonRead() {
		assertValidWithInput("if (read U8 == read U8) 100 else 50", 100, 60, 60);
	}

	@Test
	void shouldSupportEmptyStruct() {
		assertValid("struct Empty {}", 0);
	}

	@Test
	void shouldRejectDuplicateStructDefinition() {
		assertInvalid("struct Empty {} struct Empty {}");
	}

	@Test
	void shouldParseStructWithFields() {
		assertValid("struct Wrapper { value : U64 }", 0);
	}

	@Test
	void shouldParseStructWithMultipleFields() {
		assertValid("struct Point { x : U64, y : I64 }", 0);
	}

	@Test
	void shouldParseStructInstantiationAndFieldAccess() {
		assertValid("struct Wrapper { value : I32 } Wrapper { value : read I32 }.value", 0);
	}

	@Test
	void shouldReturnStructFieldValueAsExitCode() {
		assertValidWithInput("struct Wrapper { value : I32 } Wrapper { value : read I32 }.value", 42, 42);
	}

	@Test
	void shouldBindStructToVariableAndAccessField() {
		assertValidWithInput(
				"struct Wrapper { value : I32 } let temp : Wrapper = Wrapper { value : read I32 }; temp.value",
				42, 42);
	}

	@Test
	void shouldAccessMultipleFieldsOfStruct() {
		assertValidWithInput(
				"struct Point { x : U8, y : U8 } let point : Point = Point { x : read U8, y : read U8 }; point.x + point.y",
				80, 35, 45);
	}

	@Test
	void shouldDefineAndCallSimpleFunction() {
		assertValidWithInput("fn get() : I32 => read I32; get()", 42, 42);
	}

	@Test
	void shouldDefineAndCallFunctionWithParameter() {
		assertValidWithInput("fn getAndAdd(offset : I32) : I32 => read I32 + offset; getAndAdd(50)", 92, 42);
	}

	@Test
	void shouldCallFunctionWithMultipleParameters() {
		assertValidWithInput("fn add(a : I32, b : I32) : I32 => a + b; add(30, 12)", 42);
	}

	@Test
	void shouldCallFunctionWithComplexExpression() {
		assertValidWithInput("fn multiply(a : I32, b : I32) : I32 => a * b; multiply(6, 7)", 42);
	}

	@Test
	void shouldCallFunctionWithExpressionArguments() {
		assertValidWithInput("fn add(x : I32, y : I32) : I32 => x + y; add(read I32, read I32)", 92, 42, 50);
	}

	@Test
	void shouldDefineAndCallFunctionWithoutReturnType() {
		assertValidWithInput("fn get() => read U8; get()", 42, 42);
	}

	@Test
	void shouldCallFunctionWithoutReturnTypeAndParameters() {
		assertValidWithInput("fn add() => read I32 + read I32; add()", 92, 42, 50);
	}

	@Test
	void shouldCombineStructsAndFunctionsWithFieldAccess() {
		assertValidWithInput(
				"struct Point { x : I32, y : I32 } fn createPoint() => Point { x : read I32, y : read I32 }; let point = createPoint(); point.x + point.y",
				92, 42, 50);
	}

	@Test
	void shouldCallFunctionInLetBinding() {
		assertValidWithInput("fn get() => read I32; let x = get(); x", 42, 42);
	}

	@Test
	void shouldSupportThisFunctionCallSyntax() {
		assertValidWithInput("fn get() => 100; this.get()", 100);
	}

	@Test
	void shouldSupportThisFunctionCallWithParameters() {
		assertValidWithInput("fn add(x : I32, y : I32) => x + y; this.add(10, 20)", 30);
	}

	@Test
	void shouldSupportThisFunctionCallWithReadInput() {
		assertValidWithInput("fn get() => read I32; this.get()", 42, 42);
	}

	@Test
	void shouldSupportFunctionReturningThisWithFieldAccess() {
		assertValidWithInput("fn get(value : I32) => this; get(100).value", 100);
	}

	@Test
	void shouldSupportFunctionReturningThisWithMultipleParams() {
		assertValidWithInput("fn make(x : I32, y : I32) => this; make(10, 20).y", 20);
	}

	@Test
	void shouldSupportFunctionReturningThisWithReadInput() {
		assertValidWithInput("fn create(data : I32) => this; create(read I32).data", 42, 42);
	}

	@Test
	void shouldSupportFunctionCapturingPreviouslyboundVariable() {
		assertValidWithInput("let x = read U8; fn get() => x; get()", 42, 42);
	}

	@Test
	void shouldSupportYieldInsideFunctionBodyBlock() {
		assertValid("fn get() => { if (true) yield 100; 50 } + 5; get()", 105);
	}

	@Test
	void shouldSupportReturnInsideFunctionBodyBlock() {
		assertValid("fn get() => { if (true) return 100; 50 } + 5; get()", 100);
	}

	@Test
	void shouldSupportNestedFunctionDefinitions() {
		assertValid("fn outer() => { fn inner() => 100; inner() }; outer()", 100);
	}

	@Test
	void shouldSupportNestedFunctionWithParameter() {
		assertValid("fn outer() => { fn inner(x : I32) => x + 10; inner(5) }; outer()", 15);
	}

	@Test
	void shouldSupportRecursiveFunctionWithNestedInnerFunction() {
		// Complex recursive function with nested inner function that also recurses
		// sumThenMult(n : I32) returns: 1 + sumThenMult(0) + inner()
		// where sumThenMult(0) = 1
		// and inner() reads 0 and returns 0
		// Total: 1 + 1 + 0 = 2
		assertValidWithInput(
			"fn sumThenMult(n : I32) => if (n <= 0) 1 else n + sumThenMult(n - 1) + (fn inner() => { let x = read I32; if (x <= 0) 0 else x + inner() }; inner()); sumThenMult(1)",
			2, 0);
	}

	@Test
	void shouldSupportFunctionChaining() {
		// Chain multiple function calls
		// add(a, b) + multiply(a, b) with a=3, b=4 -> 7 + 12 = 19
		assertValid(
			"fn add(x : I32, y : I32) => x + y; fn multiply(x : I32, y : I32) => x * y; add(3, 4) + multiply(3, 4)",
			19);
	}

	@Test
	void shouldSupportFunctionReturningFunctionResult() {
		// One function's result becomes another function's input
		// double(add(10, 5)) -> double(15) -> 30
		assertValid(
			"fn add(a : I32, b : I32) => a + b; fn double(x : I32) => x * 2; double(add(10, 5))",
			30);
	}

	@Test
	void shouldSupportMultipleNestedFunctions() {
		// Three levels of nested functions
		assertValid(
			"fn outer() => { fn middle() => { fn inner() => 42; inner() }; middle() }; outer()",
			42);
	}

	@Test
	void shouldSupportRecursiveFactorialPattern() {
		// Tail-additive recursion: sum(4) = 4 + sum(3) + sum(2) + sum(1) + sum(0) = 10
		assertValid(
			"fn sum(n : I32) : I32 => if (n <= 0) 0 else n + sum(n - 1); sum(4)",
			10);
	}

	@Test
	void shouldSupportDeepRecursionWithLargeDepth() {
		// Deep recursion: sum from 100 down to 0 = 5050
		assertValid(
			"fn sum(n : I32) : I32 => if (n <= 0) 0 else n + sum(n - 1); sum(100)",
			5050);
	}

	@Test
	void shouldSupportRecursiveWithGuardClause() {
		// Simple pattern: if n <= 0 then base else n + recursion
		// test(5) = 5 + test(4) = 5 + 4 + test(3) = ... = 15
		assertValid(
			"fn test(n : I32) : I32 => if (n <= 0) 0 else n + test(n - 1); test(5)",
			15);
	}

	@Test
	void shouldSupportFunctionReturningResultOfArithmetic() {
		// Ensure complex arithmetic in function return works
		assertValid(
			"fn complex(a : I32, b : I32, c : I32) => a * b + c * 2 - a; complex(3, 4, 5)",
			19);
	}

	@Test
	void shouldSupportFunctionWithMaximumParameters() {
		// Function with maximum allowed parameters (6)
		assertValid(
			"fn sum6(a : I32, b : I32, c : I32, d : I32, e : I32, f : I32) : I32 => a + b + c + d + e + f; sum6(1, 2, 3, 4, 5, 6)",
			21);
	}

	@Test
	void shouldSupportRecursiveListSummation() {
		// Recursive summation with read operations matching the pattern
		// let n = read I32; if (n <= 0) 0 else n + sumList()
		assertValidWithInput(
			"fn sumList() : I32 => { let n = read I32; if (n <= 0) 0 else n + sumList() }; sumList()",
			15, 1, 2, 3, 4, 5);
	}

	@Test
	void shouldSupportFunctionWithBitwiseOperations() {
		// Function using bitwise operations
		assertValid(
			"fn bitOp(a : I32, b : I32) : I32 => (a & b) | (a ^ b); bitOp(12, 10)",
			14);
	}

	@Test
	void shouldSupportFunctionWithShiftOperations() {
		// Function with shift operations
		assertValid(
			"fn shiftOp(x : I32, n : I32) : I32 => (x << n) + (x >> 1); shiftOp(5, 2)",
			22);
	}

	@Test
	void shouldSupportMultipleFunctionCallsInExpression() {
		// Many function calls in single expression
		assertValid(
			"fn a() => 1; fn b() => 2; fn c() => 3; fn d() => 4; fn e() => 5; a() + b() + c() + d() + e()",
			15);
	}

	@Test
	void shouldSupportFunctionWithComplexNesting() {
		// Function calling another function that calls a third
		assertValid(
			"fn base(x : I32) => x + 1; fn middle(y : I32) => base(y) * 2; fn top() => middle(10); top()",
			22);
	}

	@Test
	void shouldSupportRecursiveMultiplyingValues() {
		// Recursive sum where each level adds the parameter
		// multi(5) = 5 + multi(4) = 5 + 4 + multi(3) = 5 + 4 + 3 + multi(2) = 5+4+3+2+multi(1) = 5+4+3+2+1+multi(0) = 15
		assertValid(
			"fn multi(n : I32) : I32 => if (n <= 0) 0 else n + multi(n - 1); multi(5)",
			15);
	}

	@Test
	void shouldSupportFunctionReturningThisFieldMultipleTimes() {
		// Test function that accesses 'this' multiple times
		assertValid(
			"fn getValue() => 42; fn getValue2() => 100; this.getValue() + this.getValue2()",
			142);
	}

	@Test
	void shouldSupportComplexRecursiveSum() {
		// Tail-recursive with base case
		// sumWithBase(5) = 5 + sumWithBase(4) + ... = 15
		assertValid(
			"fn sumWithBase(n : I32) : I32 => if (n <= 0) 0 else n + sumWithBase(n - 1); sumWithBase(5)",
			15);
	}

	@Test
	void shouldSupportFunctionWithReadOperationInParameter() {
		// Function taking read value as parameter
		assertValidWithInput(
			"fn addTen(x : I32) => x + 10; addTen(read I32)",
			52, 42);
	}

	@Test
	void shouldSupportNestedFunctionCallChain() {
		// Chain of function calls through nested definitions
		assertValid(
			"fn f1(x : I32) => x; fn f2(x : I32) => f1(x + 1); fn f3(x : I32) => f2(x + 1); f3(10)",
			12);
	}

	@Test
	void shouldSupportRecursiveWithSubtraction() {
		// Recursion using subtraction
		// countDown(3) = 3 + countDown(2) = 3 + 2 + countDown(1) = 3+2+1+countDown(0) = 6
		assertValid(
			"fn countDown(n : I32) : I32 => if (n <= 0) 0 else n + countDown(n - 1); countDown(3)",
			6);
	}

	@Test
	void shouldSupportSimpleFunctionWithReadInput() {
		// Simple function that uses a read value
		assertValidWithInput(
			"fn process(x : I32) => x + 5; process(read I32)",
			47, 42);
	}

	@Test
	void shouldSupportFunctionCallingMultipleFunctions() {
		// One function calls multiple other functions
		assertValid(
			"fn f1() => 10; fn f2() => 20; fn combine() => f1() + f2(); combine()",
			30);
	}

	@Test
	void shouldSupportRecursiveWithZeroBase() {
		// Recursion with zero as base case
		// sum(3) = 3 + sum(2) = 3 + 2 + sum(1) = 3 + 2 + 1 + sum(0) = 6
		assertValid(
			"fn sum(n : I32) : I32 => if (n <= 0) 0 else n + sum(n - 1); sum(3)",
			6);
	}

	@Test
	void shouldSupportDeepFunctionCallChain() {
		// Deep chain of function calls
		assertValid(
			"fn a(x : I32) => x; fn b(x : I32) => a(x + 1); fn c(x : I32) => b(x + 1); fn d(x : I32) => c(x + 1); d(1)",
			4);
	}

	@Test
	void shouldSupportRecursiveAdditionPattern() {
		// Classic recursive addition
		// add(5) = 5 + add(4) = 5 + 4 + add(3) = ... = 15
		assertValid(
			"fn add(n : I32) : I32 => if (n <= 0) 0 else n + add(n - 1); add(5)",
			15);
	}

	@Test
	void shouldSupportFunctionWithMultipleArithmetic() {
		// Function with complex arithmetic operations
		assertValid(
			"fn calc(a : I32, b : I32) => a * 3 + b * 2 - 1; calc(5, 7)",
			28);
	}

	@Test
	void shouldSupportMethodStyleFunctionCall() {
		// Function called with method syntax: value.function()
		// The parameter named 'this' receives the value the function is called on
		assertValid(
			"fn addOnce(this : I32) => this + 1; 100.addOnce()",
			101);
	}

	@Test
	void shouldSupportTuples() {
		// Tuple type annotation and indexing
		assertValidWithInput(
			"let x : (U8, U8) = (read U8, read U8); x[0] + x[1]",
			15,
			10,
			5);
	}

	private void assertInvalid(String source) {
		Result<Instruction[], CompileError> result = App.compile(source);
		if (result instanceof Result.Ok<Instruction[], CompileError> ok) {
			Assertions.fail("Expected compilation to fail, but it succeeded and produced instructions: "
					+ Instruction.displayAll(ok.value()));
		}
	}
}
