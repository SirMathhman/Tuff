package tuff;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

final class ParenthesizedFunctionParser {
	private ParenthesizedFunctionParser() {
	}

	static Operand parse(Parser parser) {
		if (parser.getIndex() >= parser.getLength() || parser.charAt(parser.getIndex()) != '(')
			return null;

		if (!looksLikeFunctionLiteral(parser))
			return null;

		return parseFunctionLiteral(parser);
	}

	private static boolean looksLikeFunctionLiteral(Parser parser) {
		int i = parser.getIndex();
		int j = i + 1;
		int depth = 1;
		for (; j < parser.getLength(); j++) {
			char c = parser.charAt(j);
			if (c == '(')
				depth++;
			else if (c == ')') {
				depth--;
				if (depth == 0)
					break;
			}
		}
		if (j < parser.getLength()) {
			int after = j + 1;
			while (after < parser.getLength() && Character.isWhitespace(parser.charAt(after)))
				after++;
			return (after + 1 < parser.getLength() && parser.charAt(after) == '=' && parser.charAt(after + 1) == '>');
		}
		return false;
	}

	private static Operand parseFunctionLiteral(Parser parser) {
		int start = parser.getIndex();
		parser.setIndex(start);
		parser.consumeChar(); // consume '('
		parser.skipWhitespace();

		List<String> paramNames = new ArrayList<>();
		List<DeclaredType> paramTypes = new ArrayList<>();

		parseParameters(parser, paramNames, paramTypes);

		if (parser.peekChar() != ')')
			throw new IllegalArgumentException("missing ')' in fn");
		parser.consumeChar();
		parser.skipWhitespace();

		DeclaredType returnType = parseReturnType(parser);

		if (!parser.startsWithArrow())
			throw new IllegalArgumentException("expected => after fn signature");
		parser.consumeArrow();
		parser.skipWhitespace();

		String body = parseFunctionBody(parser);

		FunctionDef.Signature sig = new FunctionDef.Signature(paramNames, paramTypes);
		FunctionDef fd = new FunctionDef(new ArrayList<>(), sig, new FunctionBody(returnType, body));
		return new Operand(fd, null);
	}

	private static void parseParameters(Parser parser, List<String> paramNames, List<DeclaredType> paramTypes) {
		if (parser.peekChar() == ')')
			return;

		while (true) {
			parser.skipWhitespace();
			java.util.regex.Matcher pm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
					.matcher(parser.remainingInput());
			if (!pm.find())
				throw new IllegalArgumentException("invalid parameter name in fn");
			String pname = pm.group();
			parser.consumeKeyword(pname);
			parser.skipWhitespace();

			DeclaredType ptype = null;
			if (parser.peekChar() == ':') {
				parser.consumeChar();
				parser.skipWhitespace();
				ptype = parseParamType(parser);
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

	private static DeclaredType parseParamType(Parser parser) {
		DeclaredType dt = new DeclaredType();
		String rem = parser.remainingInput();
		java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64|Size)").matcher(rem);
		java.util.regex.Matcher bm = java.util.regex.Pattern.compile("^Bool").matcher(rem);
		java.util.regex.Matcher am = java.util.regex.Pattern.compile("^\\[\\s*[^\\]]+\\]").matcher(rem);

		if (tm.find()) {
			String type = tm.group();
			dt.unsignedOrSigned = type.substring(0, 1);
			dt.width = type.substring(1);
			parser.consumeKeyword(type);
		} else if (bm.find()) {
			dt.isBool = true;
			parser.consumeKeyword("Bool");
		} else if (am.find()) {
			parseArrayTypeInPlace(parser, dt, am.group());
		} else {
			parseAliasOrVarType(parser, dt);
		}
		return dt;
	}

	private static void parseArrayTypeInPlace(Parser parser, DeclaredType dt, String found) {
		String inside = found.substring(1, found.length() - 1).trim();
		String[] parts = inside.split("\\s*;\\s*");
		String elemType = parts[0];
		if (elemType.startsWith("Bool")) {
			dt.elemIsBool = true;
		} else if (elemType.matches("^(?:U|I)(?:8|16|32|64|Size)$")) {
			dt.elemUnsignedOrSigned = elemType.substring(0, 1);
			dt.elemWidth = elemType.substring(1);
		} else {
			dt.elemTypeVarName = elemType;
		}
		if (parts.length > 1) {
			dt.arrayLength = Integer.parseInt(parts[1]);
		}
		if (parts.length > 2) {
			dt.arrayCapacity = Integer.parseInt(parts[2]);
		}
		dt.isArray = true;
		parser.setIndex(parser.getIndex() + found.length());
	}

	private static void parseAliasOrVarType(Parser parser, DeclaredType dt) {
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
				.matcher(parser.remainingInput());
		if (!idm.find())
			throw new IllegalArgumentException("invalid type in fn");
		String ident = idm.group();
		Map<String, DeclaredType> aliases = parser.getTypeAliases();
		if (aliases.containsKey(ident)) {
			DeclaredType found = aliases.get(ident);
			dt.isBool = found.isBool;
			dt.unsignedOrSigned = found.unsignedOrSigned;
			dt.width = found.width;
			dt.isArray = found.isArray;
			dt.elemIsBool = found.elemIsBool;
			dt.elemUnsignedOrSigned = found.elemUnsignedOrSigned;
			dt.elemWidth = found.elemWidth;
			dt.arrayLength = found.arrayLength;
			dt.arrayCapacity = found.arrayCapacity;
			parser.consumeKeyword(ident);
		} else {
			dt.typeVarName = ident;
			parser.consumeKeyword(dt.typeVarName);
		}
	}

	private static DeclaredType parseReturnType(Parser parser) {
		if (parser.peekChar() != ':')
			return null;
		parser.consumeChar();
		parser.skipWhitespace();
		return parseParamType(parser);
	}

	private static String parseFunctionBody(Parser parser) {
		int bodyStart = parser.getIndex();
		if (parser.peekChar() == '{') {
			int depthb = 0;
			int k = bodyStart;
			for (;; k++) {
				if (k >= parser.getLength())
					break;
				char c = parser.charAt(k);
				if (c == '{')
					depthb++;
				else if (c == '}') {
					depthb--;
					if (depthb == 0)
						break;
				}
			}
			if (k >= parser.getLength())
				throw new IllegalArgumentException("mismatched brace in fn body");
			String body = parser.getSubstring(bodyStart, k + 1);
			parser.setIndex(k + 1);
			return body;
		} else {
			String rem = parser.remainingInput();
			int relSemi = rem.indexOf(';');
			if (relSemi < 0) {
				parser.setIndex(parser.getIndex() + rem.length());
				return rem;
			} else {
				parser.setIndex(bodyStart + relSemi + 1);
				return rem.substring(0, relSemi + 1);
			}
		}
	}
}
