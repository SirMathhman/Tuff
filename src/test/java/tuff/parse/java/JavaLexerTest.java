package tuff.parse.java;

import org.junit.jupiter.api.Test;

import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class JavaLexerTest {
	@Test
	void skipsLineAndBlockCommentsButNotInsideStrings() {
		String input = "int x = 1; // line\n" +
				"/* block */ int y=2;\n" +
				"String s = \"/* not a comment */\"; // trailing\n";

		var tokens = new JavaLexer().lex(input);
		String lexemes = tokens.stream()
				.filter(t -> t.type() != JavaTokenType.EOF)
				.map(JavaToken::lexeme)
				.collect(Collectors.joining("|"));

		assertEquals(
				"int|x|=|1|;|int|y|=|2|;|String|s|=|\"/* not a comment */\"|;",
				lexemes);
	}
}
