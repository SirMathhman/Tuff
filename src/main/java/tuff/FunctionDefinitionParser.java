package tuff;

import java.util.ArrayList;
import java.util.List;

final class FunctionDefinitionParser {
	private final Parser parser;

	FunctionDefinitionParser(Parser parser) {
		this.parser = parser;
	}

	void parseFunctionDefinition() {
		parser.consumeKeyword("fn");
		parser.skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(parser.remainingInput());
		if (!idm.find())
			throw new IllegalArgumentException("invalid function name");
		String name = idm.group();
		parser.consumeKeyword(name);
		parser.skipWhitespace();

		if (parser.peekChar() != '(')
			throw new IllegalArgumentException("missing '(' in fn");
		parser.consumeChar(); // consume '('
		List<String> paramNames = new ArrayList<>();
		List<DeclaredType> paramTypes = new ArrayList<>();
		parser.skipWhitespace();
		if (parser.peekChar() != ')') {
			while (true) {
				parser.skipWhitespace();
				java.util.regex.Matcher pm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(parser.remainingInput());
				if (!pm.find())
					throw new IllegalArgumentException("invalid parameter name in fn");
				String pname = pm.group();
				parser.consumeKeyword(pname);
				parser.skipWhitespace();
				DeclaredType ptype = null;
				if (parser.peekChar() == ':') {
					parser.consumeChar();
					parser.skipWhitespace();
					ptype = readDeclaredType();
				}
				paramNames.add(pname);
				paramTypes.add(ptype);
				parser.skipWhitespace();
				if (parser.peekChar() == ',') {
					parser.consumeChar();
					parser.skipWhitespace();
					continue;
				}
				break;
			}
		}
		if (parser.peekChar() != ')')
			throw new IllegalArgumentException("missing ')' in fn");
		parser.consumeChar(); // consume ')'
		parser.skipWhitespace();

		DeclaredType returnType = null;
		if (parser.peekChar() == ':') {
			parser.consumeChar();
			parser.skipWhitespace();
			returnType = readDeclaredType();
		}

		parser.skipWhitespace();
		if (!parser.startsWithArrow())
			throw new IllegalArgumentException("expected => after fn signature");
		parser.consumeArrow();
		parser.skipWhitespace();

		// allow either a block body or a single-statement/expression terminated by ';'
		int start = parser.getIndex();
		String body;
		if (parser.peekChar() == '{') {
			int closing = findMatchingBrace(start);
			if (closing < 0)
				throw new IllegalArgumentException("mismatched brace in fn body");
			body = parser.remainingInput().substring(0, closing - start + 1);
			// advance index past the body (closing is absolute index)
			parser.setIndex(closing + 1);
		} else {
			// read until the next semicolon or EOF and use that as the function body
			String rem = parser.remainingInput();
			int relSemi = rem.indexOf(';');
			if (relSemi < 0) {
				// take rest of input as body
				body = rem;
				parser.setIndex(parser.getIndex() + rem.length());
			} else {
				body = rem.substring(0, relSemi + 1);
				parser.setIndex(start + relSemi + 1);
			}
		}

		FunctionDef fd = new FunctionDef(paramNames, paramTypes, new FunctionBody(returnType, body));
		parser.getFunctions().put(name, fd);
		// function stored; parser index already advanced past the body
	}

	private int findMatchingBrace(int start) {
		int depth = 0;
		int j = start;
		for (;; j++) {
			char c = parser.charAt(j);
			if (c == '\u0000')
				break;
			if (c == '{')
				depth++;
			else if (c == '}') {
				depth--;
				if (depth == 0)
					return j;
			}
		}
		return -1;
	}

	private DeclaredType readDeclaredType() {
		DeclaredType dt = new DeclaredType();
		java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64)")
				.matcher(parser.remainingInput());
		java.util.regex.Matcher bm = java.util.regex.Pattern.compile("^Bool").matcher(parser.remainingInput());
		if (tm.find()) {
			String type = tm.group();
			dt.unsignedOrSigned = type.substring(0, 1);
			dt.width = type.substring(1);
			parser.consumeKeyword(type);
		} else if (bm.find()) {
			dt.isBool = true;
			parser.consumeKeyword("Bool");
		} else {
			throw new IllegalArgumentException("invalid type in fn");
		}
		return dt;
	}
}
