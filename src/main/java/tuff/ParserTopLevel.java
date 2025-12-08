package tuff;

import java.util.Map;
import java.util.HashMap;

final class ParserTopLevel {
	private ParserTopLevel() {
	}

	static Operand parseStatement(Parser parser) {
		parser.skipWhitespace();
		int beforeKeyword = parser.getIndex();
		Operand leading = parser.parseLeadingKeywords();
		if (parser.getIndex() != beforeKeyword)
			return leading;
		if (parser.remainingInput().startsWith("return") && (parser.getIndex() + 6 == parser.getLength()
				|| !Character.isJavaIdentifierPart(parser.charAt(parser.getIndex() + 6)))) {
			parser.parseReturnStatement();
		}

		if (parser.remainingInput().startsWith("break") && (parser.getIndex() + 5 == parser.getLength()
				|| !Character.isJavaIdentifierPart(parser.charAt(parser.getIndex() + 5)))) {
			parser.parseBreakStatement();
		}
		int save = parser.getIndex();
		Operand assign = parser.parseAssignmentIfPresent();
		if (assign != null)
			return assign;
		parser.setIndex(save);
		return parser.parseLogicalOr();
	}

	static Operand parseTopLevelBlock(Parser parser) {
		Map<String, Operand> prev = parser.getLocals();
		Map<String, Boolean> prevMut = parser.getMutables();
		Map<String, DeclaredType> prevDeclared = parser.getDeclaredTypes();
		Map<String, FunctionDef> prevFuncs = parser.getFunctions();
		parser.setLocals(new HashMap<>(prev));
		parser.setMutables(new HashMap<>(prevMut));
		parser.setDeclaredTypes(new HashMap<>(prevDeclared));
		parser.setFunctions(new HashMap<>(prevFuncs));
		Operand last = null;
		while (true) {
			parser.skipWhitespace();
			if (parser.getIndex() >= parser.getLength())
				break;
			last = parseStatement(parser);
			parser.skipWhitespace();
			if (parser.getIndex() < parser.getLength() && parser.charAt(parser.getIndex()) == ';') {
				parser.consumeChar(); // consume ';' and continue
				continue;
			}
		}
		parser.setLocals(prev);
		parser.setMutables(prevMut);
		parser.setFunctions(prevFuncs);
		return last == null ? null : last;
	}
}
