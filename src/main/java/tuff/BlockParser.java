package tuff;

import java.util.HashMap;
import java.util.Map;

final class BlockParser {
	private final Parser parser;

	BlockParser(Parser parser) {
		this.parser = parser;
	}

	Operand parseBlock() {
		parser.consumeChar(); // consume '{'
		Map<String, Operand> prev = parser.getLocals();
		Map<String, Boolean> prevMut = parser.getMutables();
		Map<String, DeclaredType> prevDeclared = parser.getDeclaredTypes();
		parser.setLocals(new HashMap<>(prev));
		parser.setMutables(new HashMap<>(prevMut));
		parser.setDeclaredTypes(new HashMap<>(prevDeclared));
		Operand last = null;
		try {
			while (true) {
				parser.skipWhitespace();
				if (parser.peekChar() == '\u0000')
					throw new IllegalArgumentException("mismatched brace");
				if (parser.peekChar() == '}') {
					parser.consumeChar(); // consume '}'
					break;
				}
				last = parser.parseStatement();
				parser.skipWhitespace();
				if (parser.peekChar() == ';') {
					parser.consumeChar(); // consume ';' and continue
					continue;
				}
				parser.skipWhitespace();
				if (parser.peekChar() == '}') {
					continue;
				}
				if (parser.peekChar() != '}')
					throw new IllegalArgumentException("expected ';' or '}' in block");
			}

			// Merge modifications to existing outer-scope variables (don't leak new declarations)
			java.util.Set<String> outerKeys = new java.util.HashSet<>(prev.keySet());
			for (String k : parser.getLocals().keySet()) {
				if (outerKeys.contains(k))
					prev.put(k, parser.getLocals().get(k));
			}
			java.util.Set<String> outerMutKeys = new java.util.HashSet<>(prevMut.keySet());
			for (String k : parser.getMutables().keySet()) {
				if (outerMutKeys.contains(k))
					prevMut.put(k, parser.getMutables().get(k));
			}
			java.util.Set<String> outerDeclaredKeys = new java.util.HashSet<>(prevDeclared.keySet());
			for (String k : parser.getDeclaredTypes().keySet()) {
				if (outerDeclaredKeys.contains(k))
					prevDeclared.put(k, parser.getDeclaredTypes().get(k));
			}
			return last == null ? new Operand(java.math.BigInteger.ZERO, null, null) : last;
		} finally {
			parser.setLocals(prev);
			parser.setMutables(prevMut);
			parser.setDeclaredTypes(prevDeclared);
		}
	}
}
