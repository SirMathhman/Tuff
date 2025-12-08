package tuff;

final class ParenthesizedFunctionParser {
	private ParenthesizedFunctionParser() {
	}

	static Operand parse(Parser parser) {
		int i = parser.getIndex();
		int n = parser.getLength();
		String s = parser.remainingInput();

		if (i >= n || parser.charAt(i) != '(')
			return null;

		int start = i;
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
			if (after + 1 < parser.getLength() && parser.charAt(after) == '=' && parser.charAt(after + 1) == '>') {
				// looks like a parenthesized function literal; parse it
				parser.setIndex(start); // position at '('
				parser.consumeChar(); // consume '('
				parser.skipWhitespace();

				java.util.List<String> paramNames = new java.util.ArrayList<>();
				java.util.List<DeclaredType> paramTypes = new java.util.ArrayList<>();

				if (parser.peekChar() != ')') {
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
							DeclaredType dt = new DeclaredType();
							String rem = parser.remainingInput();
							java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64|Size)")
									.matcher(rem);
							java.util.regex.Matcher bm = java.util.regex.Pattern.compile("^Bool").matcher(rem);
							java.util.regex.Matcher am = java.util.regex.Pattern.compile("^\\[\\s*[^\\]]+\\]")
									.matcher(rem);
							if (tm.find()) {
								String type = tm.group();
								dt.unsignedOrSigned = type.substring(0, 1);
								dt.width = type.substring(1);
								parser.consumeKeyword(type);
							} else if (bm.find()) {
								dt.isBool = true;
								parser.consumeKeyword("Bool");
							} else if (am.find()) {
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
							} else {
								java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
										.matcher(parser.remainingInput());
								if (!idm.find())
									throw new IllegalArgumentException("invalid type in fn");
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
									dt.typeVarName = ident;
									parser.consumeKeyword(dt.typeVarName);
								}
							}
							ptype = dt;
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
					DeclaredType dt = new DeclaredType();
					String rem = parser.remainingInput();
					java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64|Size)")
							.matcher(rem);
					java.util.regex.Matcher bm = java.util.regex.Pattern.compile("^Bool").matcher(rem);
					java.util.regex.Matcher am = java.util.regex.Pattern.compile("^\\[\\s*[^\\]]+\\]")
							.matcher(rem);
					if (tm.find()) {
						String type = tm.group();
						dt.unsignedOrSigned = type.substring(0, 1);
						dt.width = type.substring(1);
						parser.consumeKeyword(type);
					} else if (bm.find()) {
						dt.isBool = true;
						parser.consumeKeyword("Bool");
					} else if (am.find()) {
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
					} else {
						java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
								.matcher(parser.remainingInput());
						if (!idm.find())
							throw new IllegalArgumentException("invalid type in fn");
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
							dt.typeVarName = ident;
							parser.consumeKeyword(dt.typeVarName);
						}
					}
					returnType = dt;
				}

				if (!parser.startsWithArrow())
					throw new IllegalArgumentException("expected => after fn signature");
				parser.consumeArrow();
				parser.skipWhitespace();

				int bodyStart = parser.getIndex();
				String body;
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
					body = parser.getSubstring(bodyStart, k + 1);
					parser.setIndex(k + 1);
				} else {
					String rem = parser.remainingInput();
					int relSemi = rem.indexOf(';');
					if (relSemi < 0) {
						body = rem;
						parser.setIndex(parser.getIndex() + rem.length());
					} else {
						body = rem.substring(0, relSemi + 1);
						parser.setIndex(bodyStart + relSemi + 1);
					}
				}

				FunctionDef.Signature sig = new FunctionDef.Signature(paramNames, paramTypes);
				FunctionDef fd = new FunctionDef(new java.util.ArrayList<>(), sig, new FunctionBody(returnType, body));
				return new Operand(fd, null);
			}
		}

		return null;
	}
}
