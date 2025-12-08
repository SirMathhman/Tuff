package tuff;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class AppTest {
	@Test
	void greetReturnsExpectedString() {
		assertEquals("Hello from Tuff App!", App.greet());
	}

	@Test
	void interpretEmptyReturnsEmpty() {
		assertEquals("", App.interpret(""));
	}

	@Test
	void interpretOneHundredReturnsSame() {
		assertEquals("100", App.interpret("100"));
	}

	@Test
	void interpretArrayIndexSum() {
		String src = "let array : [U8; 3; 3] = [1, 2, 3]; array[0] + array[1] + array[2]";
		assertEquals("6", App.interpret(src));
	}

	@Test
	void interpretArrayInitializerLengthMismatchThrows() {
		assertThrows(IllegalArgumentException.class,
				() -> App.interpret("let array : [U8; 2; 3] = [1, 2, 3];"));
	}

	@Test
	void interpretMutableU16ArraySingleElementReturnsValue() {
		String src = "let mut array : [U16; 1; 1] = [100U16]; array[0]";
		assertEquals("100", App.interpret(src));
	}

	@Test
	void interpretZeroLengthArrayTypeAllowed() {
		assertEquals("", App.interpret("let array : [U8; 0; 1];"));
	}

	@Test
	void interpretTypeOnlyArrayDeclarationReturnsEmpty() {
		assertEquals("", App.interpret("let array : [U8];"));
	}

	@Test
	void interpretTypedUSizeDeclarationReturnsValue() {
		assertEquals("100", App.interpret("let value : USize = 100USize; value"));
	}

	@Test
	void interpretGenericPassReturnsArgument() {
		assertEquals("100", App.interpret("fn pass<T>(value : T) : T => value; pass(100)"));
	}

	@Test
	void interpretGenericPassWithExplicitTypeReturnsArgument() {
		assertEquals("100", App.interpret("fn pass<T>(value : T) : T => value; pass<I32>(100)"));
	}

	@Test
	void interpretExternCreateArrayThenAssign() {
		String src = "extern fn createArray<T>(length : USize) : [T]; let mut array : [I32] = createArray<I32>(1); array[0] = 100; array[0]";
		assertEquals("100", App.interpret(src));
	}

	@Test
	void interpretTypeAliasNumericThenUse() {
		String src = "type MyInt = I32; let value : MyInt = 100; value";
		assertEquals("100", App.interpret(src));
	}

	@Test
	void interpretIsTypeReturnsTrue() {
		assertEquals("true", App.interpret("let value : I32 = 100; value is I32"));
	}

	@Test
	void interpretEmptyStructDeclarationReturnsEmpty() {
		assertEquals("", App.interpret("struct Empty { }"));
	}

	@Test
	void interpretZeroLengthArrayAssignExpandsAndAssigns() {
		assertEquals("100", App.interpret("let mut array : [U8; 0; 1]; array[0] = 100; array[0]"));
	}

	@Test
	void interpretCopyZeroLengthTypedArrayToDifferentSizedTypedArrayThrows() {
		assertThrows(IllegalArgumentException.class,
				() -> App.interpret("let mut array : [U8; 0; 5]; let copy : [U8; 3; 5] = array;"));
	}

	@Test
	void interpretBuildArrayByIndexThenCopyToTypedArrayWorks() {
		String src = "let mut array : [U16; 0; 5]; array[0] = 100U16; array[1] = 200U16; array[2] = 300U16; let copy : [U16; 3; 5] = array; copy[0]";
		assertEquals("100", App.interpret(src));
	}

	@Test
	void interpretAssignOutOfRangeToU8ArrayThrows() {
		assertThrows(IllegalArgumentException.class,
				() -> App.interpret(
						"let mut array : [U8; 0; 5]; array[0] = 100; array[0] = 200; array[0] = 300; let copy : [U8; 3; 5] = array;"));
	}

	@Test
	void interpretTwoHundredReturnsSame() {
		assertEquals("200", App.interpret("200"));
	}

	@Test
	void interpretLargeNumberReturnsSame() {
		assertEquals("163638", App.interpret("163638"));
	}

	@Test
	void interpretWithU8SuffixReturnsNumber() {
		assertEquals("100", App.interpret("100U8"));
	}

	@Test
	void interpretAddU8ReturnsSum() {
		assertEquals("150", App.interpret("100U8 + 50U8"));
	}

	@Test
	void interpretChainedU8AdditionReturnsSum() {
		assertEquals("6", App.interpret("1U8 + 2U8 + 3U8"));
	}

	@Test
	void interpretMixedSubtractAddReturnsCorrect() {
		assertEquals("8", App.interpret("10 - 5U8 + 3"));
	}

	@Test
	void interpretMultiplyThenAddReturnsCorrect() {
		assertEquals("53", App.interpret("10 * 5U8 + 3"));
	}

	@Test
	void interpretAddThenMultiplyReturnsCorrect() {
		assertEquals("53", App.interpret("3 + 10 * 5U8"));
	}

	@Test
	void interpretDivideThenAddReturnsCorrect() {
		assertEquals("6", App.interpret("10 / 2 + 1"));
	}

	@Test
	void interpretDivisionByZeroThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("10 / 0"));
	}

	@Test
	void interpretModuloReturnsCorrect() {
		assertEquals("2", App.interpret("10 % 8"));
	}

	@Test
	void interpretModuloByZeroThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("10 % 0"));
	}

	@Test
	void interpretParenthesesGroupingEvaluatesCorrectly() {
		assertEquals("9", App.interpret("(1U8 + 2U8) * 3"));
	}

	@Test
	void interpretCurlyBraceGroupingEvaluatesCorrectly() {
		assertEquals("3", App.interpret("9 / { 2 + 1 }"));
	}

	@Test
	void interpretBlockLetAndVarLookup() {
		assertEquals("3", App.interpret("9 / { let x : I32 = 2 + 1; x }"));
	}

	@Test
	void interpretTopLevelLetAndLookup() {
		assertEquals("100", App.interpret("let x : I32 = 100; x"));
	}

	@Test
	void interpretTopLevelLetWithoutType() {
		assertEquals("100", App.interpret("let x = 100; x"));
	}

	@Test
	void interpretDuplicateTopLevelLetThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("let x = 100; let x = 200;"));
	}

	@Test
	void interpretTypedLetOverflowThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("let x : U8 = 100 + 200;"));
	}

	@Test
	void interpretTwoTopLevelLetsAndExpression() {
		assertEquals("300", App.interpret("let x : I32 = 100; let y : I32 = 200; x + y"));
	}

	@Test
	void interpretNestedBlockInitializer() {
		assertEquals("200", App.interpret("let x : I32 = {let y : I32 = 200; y}; x"));
	}

	@Test
	void interpretTopLevelLetVisibleInBlock() {
		assertEquals("100", App.interpret("let x = 100; { x }"));
	}

	@Test
	void interpretBlockLocalNotVisibleOutside() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("{let x = 100;} x"));
	}

	@Test
	void interpretLetInitializerSelfReferenceThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("let x = { x + 100 };"));
	}

	@Test
	void interpretBooleanTrueReturnsTrue() {
		assertEquals("true", App.interpret("true"));
	}

	@Test
	void interpretBooleanFalseReturnsFalse() {
		assertEquals("false", App.interpret("false"));
	}

	@Test
	void interpretCharLiteralReturnsSame() {
		assertEquals("'a'", App.interpret("'a'"));
	}

	@Test
	void interpretDoubleQuotedStringReturnsSame() {
		assertEquals("\"value\"", App.interpret("\"value\""));
	}

	@Test
	void interpretStringConcatenationReturnsCombined() {
		assertEquals("\"foobar\"", App.interpret("\"foo\" + \"bar\""));
	}

	@Test
	void interpretStringLengthOnLiteral() {
		assertEquals("4", App.interpret("\"test\".length"));
	}

	@Test
	void interpretStringLengthOnVariable() {
		assertEquals("4", App.interpret("let s = \"test\"; s.length"));
	}

	@Test
	void interpretStringIndexLiteral() {
		assertEquals("'t'", App.interpret("\"test\"[0]"));
	}

	@Test
	void interpretStringIndexVariable() {
		assertEquals("'t'", App.interpret("let s = \"test\"; s[0]"));
	}

	@Test
	void interpretExternPrintConcatenatesOutput() {
		String src = "extern fn print(value : String) : Void; print(\"Hello \" ); print(\"World!\");";
		assertEquals("Hello World!", App.interpret(src));
	}

	@Test
	void interpretAllRunsMultipleSourcesWithMain() {
		java.util.Map<String, String> sources = new java.util.HashMap<>();
		sources.put("lib", "fn add(a : I32, b : I32) : I32 => a + b;");
		sources.put("main", "add(2, 3)");
		assertEquals("5", App.interpretAll("main", sources));
	}

	@Test
	void interpretAllRejectsMissingMain() {
		java.util.Map<String, String> sources = new java.util.HashMap<>();
		sources.put("other", "1 + 1");
		assertThrows(IllegalArgumentException.class, () -> App.interpretAll("main", sources));
	}

	@Test
	void interpretAllDefaultsToMainKey() {
		java.util.Map<String, String> sources = new java.util.HashMap<>();
		sources.put("lib", "fn add(a : I32, b : I32) : I32 => a + b;");
		sources.put("main", "add(5, 7)");
		// use the overload that defaults to "main"
		assertEquals("12", App.interpretAll(sources));
	}

	@Test
	void interpretAllMainOnlyReturnsMainResult() {
		java.util.Map<String, String> sources = new java.util.HashMap<>();
		sources.put("main", "100");
		assertEquals("100", App.interpretAll(sources));
	}

	@Test
	void interpretAllUseModuleBracedImport() {
		java.util.Map<String, String> sources = new java.util.HashMap<>();
		sources.put("lib", "out let x = 100; out let y = 200;");
		sources.put("main", "use lib::{x, y}; x + y");
		assertEquals("300", App.interpretAll(sources));
	}

	@Test
	void loadSourceFileCreatesKeyFromRelativePath() throws Exception {
		java.nio.file.Path base = java.nio.file.Files.createTempDirectory("tuff-src-base");
		java.nio.file.Path sub = java.nio.file.Files.createDirectories(base.resolve("foo"));
		java.nio.file.Path file = java.nio.file.Files.createFile(sub.resolve("bar.tuff"));
		java.nio.file.Files.writeString(file, "content here", java.nio.charset.StandardCharsets.UTF_8);

		java.util.Map<String, String> map = App.loadSourceFile(file.toString(), base.toString());
		org.junit.jupiter.api.Assertions.assertEquals(1, map.size());
		org.junit.jupiter.api.Assertions.assertTrue(map.containsKey("foo::bar"));
		org.junit.jupiter.api.Assertions.assertEquals("content here", map.get("foo::bar"));
	}

	@Test
	void interpretAllParameterizedModuleImport() {
		java.util.Map<String, String> sources = new java.util.HashMap<>();
		sources.put("lib", "in let value : I32; out let copy = value;");
		sources.put("main", "use lib { 300 }::{ copy }; copy");
		assertEquals("300", App.interpretAll(sources));
	}

	@Test

	void interpretModuleNamespaceLookup() {
		assertEquals("100", App.interpret("module test { let value = 100; } test::value"));
	}

	@Test
	void interpretLogicalOrReturnsTrue() {
		assertEquals("true", App.interpret("true || false"));
	}

	@Test
	void interpretLogicalAndReturnsFalse() {
		assertEquals("false", App.interpret("true && false"));
	}

	@Test
	void interpretLogicalOrWithNumericAndBooleanThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("100U8 || false"));
	}

	@Test
	void interpretArithmeticOnBooleansThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("true + false"));
	}

	@Test
	void interpretTypedAssignmentBetweenDifferentWidthsThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("let x : U16 = 100; let y : U8 = x;"));
	}

	@Test
	void interpretBoolAssignedToNumericTypedThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("let x : Bool = false; let y : U8 = x;"));
	}

	@Test
	void interpretBoolTypedCopyToBoolAccepts() {
		assertEquals("false", App.interpret("let x : Bool = false; let y : Bool = x; y"));
	}

	@Test
	void interpretNumericEqualityFalse() {
		assertEquals("false", App.interpret("100 == 200"));
	}

	@Test
	void interpretNumericEqualityTrue() {
		assertEquals("true", App.interpret("100 == 100"));
	}

	@Test
	void interpretInequalityOperator() {
		assertEquals("true", App.interpret("100 != 200"));
		assertEquals("false", App.interpret("100 != 100"));
	}

	@Test
	void interpretRelationalOperators() {
		assertEquals("true", App.interpret("100 < 200"));
		assertEquals("false", App.interpret("200 < 100"));
		assertEquals("true", App.interpret("200 <= 200"));
		assertEquals("false", App.interpret("201 <= 200"));
		assertEquals("true", App.interpret("200 > 100"));
		assertEquals("false", App.interpret("100 > 200"));
		assertEquals("true", App.interpret("200 >= 200"));
		assertEquals("false", App.interpret("199 >= 200"));
	}

	@Test
	void interpretIfExpressionTrueBranch() {
		assertEquals("300", App.interpret("let x = if (true) 100 + 200 else -1; x"));
	}

	@Test
	void interpretIfExpressionFalseBranch() {
		assertEquals("-1", App.interpret("let x = if (false) 100 + 200 else -1; x"));
	}

	@Test
	void interpretInvalidTypeInLetIncludesNameAndType() {
		IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
				() -> App.interpret("let x : String = \"\";"));
		assertTrue(ex.getMessage().contains("x"));
		assertTrue(ex.getMessage().contains("String"));
	}
}
