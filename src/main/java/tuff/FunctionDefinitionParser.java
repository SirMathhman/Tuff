package tuff;

import java.util.ArrayList;
import java.util.List;

final class FunctionDefinitionParser {
	private final Parser parser;

	FunctionDefinitionParser(Parser parser) {
		this.parser = parser;
	}

	private java.util.List<String> parseTypeParams() {
		java.util.List<String> typeParams = new ArrayList<>();
		if (parser.peekChar() == '<') {
			parser.consumeChar();
			parser.skipWhitespace();
			while (true) {
				java.util.regex.Matcher tpm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
						.matcher(parser.remainingInput());
				if (!tpm.find())
					throw new IllegalArgumentException("invalid type parameter name in fn");
				String tp = tpm.group();
				typeParams.add(tp);
				parser.consumeKeyword(tp);
				parser.skipWhitespace();
				if (parser.peekChar() == ',') {
					parser.consumeChar();
					parser.skipWhitespace();
					continue;
				}
				break;
			}
			if (parser.peekChar() != '>')
				throw new IllegalArgumentException("missing '>' in generic type parameter list");
			parser.consumeChar();
			parser.skipWhitespace();
		}
		return typeParams;
	}

	private FunctionDef.Signature parseSignatureParameters() {
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
		return new FunctionDef.Signature(paramNames, paramTypes);
	}

	void parseFunctionDefinition() {
		parseFunctionDefinition(false);
	}

	void parseFunctionDefinition(boolean allowExtern) {
		parser.consumeKeyword("fn");
		parser.skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(parser.remainingInput());
		if (!idm.find())
			throw new IllegalArgumentException("invalid function name");
		String name = idm.group();
		parser.consumeKeyword(name);
		parser.skipWhitespace();

		java.util.List<String> typeParams = parseTypeParams();

		FunctionDef.Signature parsedSig = parseSignatureParameters();
		List<String> paramNames = parsedSig.paramNames;
		List<DeclaredType> paramTypes = parsedSig.paramTypes;
		parser.skipWhitespace();

		DeclaredType returnType = null;
		if (parser.peekChar() == ':') {
			parser.consumeChar();
			parser.skipWhitespace();
			returnType = readDeclaredType();
		}

		parser.skipWhitespace();
		if (allowExtern && !parser.startsWithArrow()) {
			FunctionDef.Signature sig = new FunctionDef.Signature(paramNames, paramTypes);
			parser.getFunctions().put(name, new FunctionDef(typeParams, sig, null));
			if (parser.peekChar() == ';') {
				parser.consumeChar();
			}
			return;
		}
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

		FunctionDef.Signature sig = new FunctionDef.Signature(paramNames, paramTypes);
		FunctionDef fd = new FunctionDef(typeParams, sig, new FunctionBody(returnType, body));
		parser.getFunctions().put(name, fd);
		// function stored; parser index already advanced past the body
	}

	// parse a function literal (expression) and return a FunctionDef without
	// registering it in the caller's function map. Accepts an optional name.
	static Operand parseFunctionLiteral(Parser parser) {
		parser.consumeKeyword("fn");
		parser.skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
				.matcher(parser.remainingInput());
		String name = null;
		if (idm.find()) {
			name = idm.group();
			parser.consumeKeyword(name);
			parser.skipWhitespace();
		}

		java.util.List<String> typeParams = new ArrayList<>();
		if (parser.peekChar() == '<') {
			// reuse instance parsing logic: temporarily create a helper
			FunctionDefinitionParser helper = new FunctionDefinitionParser(parser);
			typeParams = helper.parseTypeParams();
		}

		FunctionDef.Signature parsedSig = new FunctionDefinitionParser(parser).parseSignatureParameters();
		java.util.List<String> paramNames = parsedSig.paramNames;
		java.util.List<DeclaredType> paramTypes = parsedSig.paramTypes;
		parser.skipWhitespace();

		DeclaredType returnType = null;
		if (parser.peekChar() == ':') {
			parser.consumeChar();
			parser.skipWhitespace();
			returnType = new FunctionDefinitionParser(parser).readDeclaredType();
		}

		if (!parser.startsWithArrow())
			throw new IllegalArgumentException("expected => after fn signature");
		parser.consumeArrow();
		parser.skipWhitespace();

		int start = parser.getIndex();
		String body;
		if (parser.peekChar() == '{') {
			int closing = new FunctionDefinitionParser(parser).findMatchingBrace(start);
			if (closing < 0)
				throw new IllegalArgumentException("mismatched brace in fn body");
			body = parser.remainingInput().substring(0, closing - start + 1);
			parser.setIndex(closing + 1);
		} else {
			String rem = parser.remainingInput();
			int relSemi = rem.indexOf(';');
			if (relSemi < 0) {
				body = rem;
				parser.setIndex(parser.getIndex() + rem.length());
			} else {
				body = rem.substring(0, relSemi + 1);
				parser.setIndex(start + relSemi + 1);
			}
		}

		FunctionDef.Signature sig = new FunctionDef.Signature(paramNames, paramTypes);
		FunctionDef fd = new FunctionDef(typeParams, sig, new FunctionBody(returnType, body));
		return new Operand(fd, name);
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
		String rem = parser.remainingInput();

		if (tryReadNumericType(dt, rem))
			return dt;
		if (tryReadBoolType(dt, rem))
			return dt;
		if (tryReadStringType(dt, rem))
			return dt;
		if (tryReadArrayType(dt, rem))
			return dt;
		if (tryReadFunctionType(dt))
			return dt;

		// alias or generic type variable
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(rem);
		if (!idm.find()) {
			String invalid = rem.trim().isEmpty() ? rem : rem.split("\\s+")[0];
			String guidance = "expected a type like U8/I32, Bool, String, array ([T]), function type (e.g. (I32)=>I32), or a type alias";
			// common mistake: starting a function body here (e.g. 'action : () => {')
			if (rem.trim().startsWith("{")) {
				throw new IllegalArgumentException("invalid type in fn: '" + invalid
						+ "' (looks like a function body started — did you mean a function type like '() => Void' or to move '{' after the outer =>?)");
			}
			throw new IllegalArgumentException("invalid type in fn: '" + invalid + "' (" + guidance + ")");
		}
		String ident = idm.group();
		java.util.Map<String, DeclaredType> aliases = parser.getTypeAliases();
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
			// treat as a generic type variable (e.g., T)
			dt.typeVarName = ident;
			parser.consumeKeyword(dt.typeVarName);
		}
		return dt;
	}

	private boolean tryReadNumericType(DeclaredType dt, String rem) {
		java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64|Size)").matcher(rem);
		if (tm.find()) {
			String type = tm.group();
			dt.unsignedOrSigned = type.substring(0, 1);
			dt.width = type.substring(1);
			parser.consumeKeyword(type);
			return true;
		}
		return false;
	}

	private boolean tryReadBoolType(DeclaredType dt, String rem) {
		java.util.regex.Matcher bm = java.util.regex.Pattern.compile("^Bool").matcher(rem);
		if (bm.find()) {
			dt.isBool = true;
			parser.consumeKeyword("Bool");
			return true;
		}
		return false;
	}

	private boolean tryReadStringType(DeclaredType dt, String rem) {
		java.util.regex.Matcher sm = java.util.regex.Pattern.compile("^String").matcher(rem);
		if (sm.find()) {
			dt.isString = true;
			parser.consumeKeyword("String");
			return true;
		}
		return false;
	}

	private boolean tryReadArrayType(DeclaredType dt, String rem) {
		java.util.regex.Matcher am = java.util.regex.Pattern.compile("^\\[\\s*[^\\]]+\\]").matcher(rem);
		if (am.find()) {
			String found = am.group();
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
				try {
					dt.arrayLength = Integer.parseInt(parts[1]);
				} catch (Exception ex) {
					throw new IllegalArgumentException("invalid array length in type");
				}
			}
			if (parts.length > 2) {
				try {
					dt.arrayCapacity = Integer.parseInt(parts[2]);
				} catch (Exception ex) {
					throw new IllegalArgumentException("invalid array capacity in type");
				}
			}
			dt.isArray = true;
			parser.setIndex(parser.getIndex() + found.length());
			return true;
		}
		return false;
	}

	private boolean tryReadFunctionType(DeclaredType dt) {
		if (parser.peekChar() == '(') {
			parser.consumeChar();
			parser.skipWhitespace();
			java.util.List<DeclaredType> params = new java.util.ArrayList<>();
			if (parser.peekChar() != ')') {
				while (true) {
					DeclaredType p = readDeclaredType();
					params.add(p);
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
				throw new IllegalArgumentException("missing ')' in function type");
			parser.consumeChar();
			parser.skipWhitespace();
			if (!(parser.peekChar() == '=' && parser.getIndex() + 1 < parser.getLength()
					&& parser.charAt(parser.getIndex() + 1) == '>'))
				throw new IllegalArgumentException("missing => in function type");
			parser.consumeArrow();
			parser.skipWhitespace();
			DeclaredType ret = readDeclaredType();
			dt.isFunction = true;
			dt.functionParamTypes = params;
			dt.functionReturnType = ret;
			return true;
		}
		return false;
	}

}
