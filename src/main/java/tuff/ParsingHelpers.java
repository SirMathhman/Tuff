package tuff;

import java.util.HashMap;
import java.util.Map;

/**
 * Static helper methods for parsing operations.
 * Extracted from Parser.java to reduce file complexity.
 */
public final class ParsingHelpers {

	private ParsingHelpers() {
		// utility class
	}

	/**
	 * Parse leading keywords (let, fn, while) and return result or null if no
	 * keyword matched.
	 */
	static Operand parseLeadingKeywords(Parser parser) {
		parser.skipWhitespace();
		if (parser.startsWithKeyword("let")) {
			return parser.parseLetStatementDirect();
		}
		if (parser.startsWithKeyword("fn")) {
			new FunctionDefinitionParser(parser).parseFunctionDefinition(false);
			return null;
		}

		if (parser.startsWithKeyword("module")) {
			parser.consumeKeyword("module");
			parser.skipWhitespace();
			java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
					.matcher(parser.remainingInput());
			if (!idm.find())
				throw new IllegalArgumentException("invalid module name");
			String name = idm.group();
			parser.consumeKeyword(name);
			parser.skipWhitespace();
			if (parser.peekChar() != '{')
				throw new IllegalArgumentException("missing '{' in module declaration");
			int start = parser.getIndex();
			int depth = 0;
			int j = start;
			for (;; j++) {
				char c = parser.charAt(j);
				if (c == '\u0000')
					throw new IllegalArgumentException("mismatched brace in module body");
				if (c == '{')
					depth++;
				else if (c == '}') {
					depth--;
					if (depth == 0)
						break;
				}
			}
			// inner body without outer braces
			String inner = parser.getSubstring(start + 1, j);
			Parser p2 = new Parser(inner);
			// parse inner content as a top-level sequence so declared locals are retained
			while (true) {
				p2.skipWhitespace();
				if (!p2.hasNext())
					break;
				p2.parseStatement();
				p2.skipWhitespace();
				if (p2.hasNext() && p2.peekChar() == ';') {
					p2.consumeChar();
					continue;
				}
			}
			parser.getModules().put(name, new java.util.LinkedHashMap<>(p2.getLocals()));
			// advance index past closing brace
			parser.setIndex(j + 1);
			return null;
		}

		if (parser.startsWithKeyword("extern")) {
			parser.consumeKeyword("extern");
			parser.skipWhitespace();
			if (parser.startsWithKeyword("struct")) {
				parser.consumeKeyword("struct");
				parser.skipWhitespace();
				java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
						.matcher(parser.remainingInput());
				if (!idm.find())
					throw new IllegalArgumentException("invalid struct name");
				String name = idm.group();
				parser.consumeKeyword(name);
				parser.skipWhitespace();
				if (parser.peekChar() != '{')
					throw new IllegalArgumentException("missing '{' in struct declaration");
				// parse fields inside braces: 'field : Type' separated by commas
				parser.consumeChar(); // consume '{'
				java.util.Map<String, DeclaredType> fields = new java.util.LinkedHashMap<>();
				parser.skipWhitespace();
				while (parser.peekChar() != '}') {
					java.util.regex.Matcher fm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
							.matcher(parser.remainingInput());
					if (!fm.find())
						throw new IllegalArgumentException("invalid struct field name");
					String fname = fm.group();
					parser.consumeKeyword(fname);
					parser.skipWhitespace();
					if (parser.peekChar() != ':')
						throw new IllegalArgumentException("missing ':' in struct field");
					parser.consumeChar();
					parser.skipWhitespace();
					// parse field type (reuse let-style declared type parsing rules)
					DeclaredType fdt = new DeclaredType();
					String rem = parser.remainingInput();
					java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64|Size)").matcher(rem);
					java.util.regex.Matcher bm = java.util.regex.Pattern.compile("^Bool").matcher(rem);
					java.util.regex.Matcher am = java.util.regex.Pattern.compile("^\\[\\s*[^\\]]+\\]").matcher(rem);
					if (tm.find()) {
						String t = tm.group();
						fdt.unsignedOrSigned = t.substring(0, 1);
						fdt.width = t.substring(1);
						parser.consumeKeyword(t);
					} else if (bm.find()) {
						fdt.isBool = true;
						parser.consumeKeyword("Bool");
					} else if (am.find()) {
						String found = am.group();
						String inside = found.substring(1, found.length() - 1).trim();
						String[] parts = inside.split("\\s*;\\s*");
						String elemType = parts[0];
						if (elemType.startsWith("Bool")) {
							fdt.elemIsBool = true;
						} else if (elemType.matches("^(?:U|I)(?:8|16|32|64|Size)$")) {
							fdt.elemUnsignedOrSigned = elemType.substring(0, 1);
							fdt.elemWidth = elemType.substring(1);
						} else {
							java.util.Map<String, DeclaredType> aliases = parser.getTypeAliases();
							if (!aliases.containsKey(elemType))
								throw new IllegalArgumentException("unknown type alias: " + elemType);
							DeclaredType a = aliases.get(elemType);
							fdt.elemIsBool = a.isBool;
							fdt.elemUnsignedOrSigned = a.elemUnsignedOrSigned;
							fdt.elemWidth = a.elemWidth;
						}
						if (parts.length > 1) {
							try {
								fdt.arrayLength = Integer.parseInt(parts[1]);
							} catch (Exception ex) {
								throw new IllegalArgumentException("invalid array length in type");
							}
						}
						if (parts.length > 2) {
							try {
								fdt.arrayCapacity = Integer.parseInt(parts[2]);
							} catch (Exception ex) {
								throw new IllegalArgumentException("invalid array capacity in type");
							}
						}
						fdt.isArray = true;
						parser.setIndex(parser.getIndex() + found.length());
					} else {
						// alias or identifier: support alias
						java.util.regex.Matcher idm2 = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(rem);
						if (!idm2.find())
							throw new IllegalArgumentException("invalid type in struct field");
						String alias = idm2.group();
						java.util.Map<String, DeclaredType> aliases = parser.getTypeAliases();
						if (!aliases.containsKey(alias))
							throw new IllegalArgumentException("unknown type alias: " + alias);
						DeclaredType a = aliases.get(alias);
						fdt.isBool = a.isBool;
						fdt.unsignedOrSigned = a.unsignedOrSigned;
						fdt.width = a.width;
						fdt.isArray = a.isArray;
						fdt.elemIsBool = a.elemIsBool;
						fdt.elemUnsignedOrSigned = a.elemUnsignedOrSigned;
						fdt.elemWidth = a.elemWidth;
						fdt.arrayLength = a.arrayLength;
						fdt.arrayCapacity = a.arrayCapacity;
						parser.consumeKeyword(alias);
					}
					fields.put(fname, fdt);
					parser.skipWhitespace();
					if (parser.peekChar() == ',') {
						parser.consumeChar();
						parser.skipWhitespace();
						continue;
					}
					if (parser.peekChar() == '}')
						break;
				}
				if (parser.peekChar() != '}')
					throw new IllegalArgumentException("missing '}' in struct declaration");
				parser.consumeChar(); // consume '}'
				DeclaredType dt = new DeclaredType();
				dt.isStruct = true;
				dt.structFields = fields;
				parser.getTypeAliases().put(name, dt);
				return null;
			} else if (parser.startsWithKeyword("fn")) {
				new FunctionDefinitionParser(parser).parseFunctionDefinition(true);
				return null;
			}
			return null;
		}

		if (parser.startsWithKeyword("type")) {
			parser.consumeKeyword("type");
			parser.skipWhitespace();
			java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(parser.remainingInput());
			if (!idm.find())
				throw new IllegalArgumentException("invalid alias name");
			String name = idm.group();
			parser.consumeKeyword(name);
			parser.skipWhitespace();
			if (parser.peekChar() != '=')
				throw new IllegalArgumentException("missing '=' in type alias");
			parser.consumeChar(); // consume '='
			parser.skipWhitespace();
			DeclaredType dt = new DeclaredType();
			String rem = parser.remainingInput();
			java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64|Size)").matcher(rem);
			java.util.regex.Matcher bm = java.util.regex.Pattern.compile("^Bool").matcher(rem);
			java.util.regex.Matcher am = java.util.regex.Pattern.compile("^\\[\\s*[^\\]]+\\]").matcher(rem);
			if (tm.find()) {
				String t = tm.group();
				dt.unsignedOrSigned = t.substring(0, 1);
				dt.width = t.substring(1);
				parser.consumeKeyword(t);
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
					// element type is an alias
					java.util.Map<String, DeclaredType> aliases = parser.getTypeAliases();
					if (!aliases.containsKey(elemType))
						throw new IllegalArgumentException("unknown type alias: " + elemType);
					DeclaredType a = aliases.get(elemType);
					dt.elemIsBool = a.isBool;
					dt.elemUnsignedOrSigned = a.elemUnsignedOrSigned;
					dt.elemWidth = a.elemWidth;
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
				// identifier type alias
				java.util.regex.Matcher idm2 = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(rem);
				if (!idm2.find())
					throw new IllegalArgumentException("invalid type in type alias");
				String aliasName = idm2.group();
				java.util.Map<String, DeclaredType> aliases = parser.getTypeAliases();
				if (!aliases.containsKey(aliasName))
					throw new IllegalArgumentException("unknown type alias: " + aliasName);
				DeclaredType foundDt = aliases.get(aliasName);
				// shallow copy
				dt.isBool = foundDt.isBool;
				dt.unsignedOrSigned = foundDt.unsignedOrSigned;
				dt.width = foundDt.width;
				dt.isArray = foundDt.isArray;
				dt.elemIsBool = foundDt.elemIsBool;
				dt.elemUnsignedOrSigned = foundDt.elemUnsignedOrSigned;
				dt.elemWidth = foundDt.elemWidth;
				dt.arrayLength = foundDt.arrayLength;
				dt.arrayCapacity = foundDt.arrayCapacity;
				parser.consumeKeyword(aliasName);
			}
			// register alias
			parser.getTypeAliases().put(name, dt);
			return null;
		}

		if (parser.startsWithKeyword("struct"))

		{
			parser.consumeKeyword("struct");
			parser.skipWhitespace();
			java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(parser.remainingInput());
			if (!idm.find())
				throw new IllegalArgumentException("invalid struct name");
			String name = idm.group();
			parser.consumeKeyword(name);
			parser.skipWhitespace();
			if (parser.peekChar() != '{')
				throw new IllegalArgumentException("missing '{' in struct declaration");
			// consume body until matching '}' (no nesting handling needed for simple
			// structs)
			int start = parser.getIndex();
			int depth = 0;
			int j = start;
			for (;; j++) {
				char c = parser.charAt(j);
				if (c == '\u0000')
					throw new IllegalArgumentException("mismatched brace in struct body");
				if (c == '{')
					depth++;
				else if (c == '}') {
					depth--;
					if (depth == 0)
						break;
				}
			}
			// advance index past closing brace
			parser.setIndex(j + 1);
			return null;
		}
		if (parser.startsWithKeyword("while")) {
			new WhileStatementParser(parser).parseWhileStatement();
			return null;
		}
		return null;
	}

	/**
	 * Parse a return statement and throw ReturnException.
	 */
	static void parseReturnStatement(Parser parser) {
		if (!parser.isAllowReturn())
			throw new IllegalArgumentException("return outside function");
		parser.consumeKeyword("return");
		parser.skipWhitespace();
		Operand ret = parser.parseLogicalOr();
		throw new ReturnException(ret);
	}

	/**
	 * Parse a break statement and throw BreakException.
	 */
	static void parseBreakStatement(Parser parser) {
		if (parser.getLoopDepth() == 0)
			throw new IllegalArgumentException("break outside of loop");
		parser.consumeKeyword("break");
		throw new BreakException();
	}

	/**
	 * Bind function parameters to local values with type validation.
	 */
	static Map<String, Operand> bindFunctionParameters(FunctionDef fd, java.util.List<Operand> args,
			java.util.Map<String, DeclaredType> typeBindings) {
		Map<String, Operand> fLocals = new HashMap<>();
		for (int idx = 0; idx < args.size(); idx++) {
			Operand a = args.get(idx);
			DeclaredType pdt = fd.signature.paramTypes.get(idx);
			// if parameter is a type variable, and a binding exists, use concrete type
			if (pdt != null && pdt.typeVarName != null && typeBindings != null
					&& typeBindings.containsKey(pdt.typeVarName)) {
				pdt = typeBindings.get(pdt.typeVarName);
			}
			if (pdt != null && pdt.typeVarName != null) {
				// generic type parameter without binding -> accept any argument
				fLocals.put(fd.signature.paramNames.get(idx), a);
				continue;
			}
			if (pdt != null && pdt.isBool) {
				if (a.isBoolean == null)
					throw new IllegalArgumentException("typed Bool assignment requires boolean operand");
				fLocals.put(fd.signature.paramNames.get(idx), new Operand(a.value, true));
			} else if (pdt != null && pdt.unsignedOrSigned != null && pdt.width != null) {
				if (a.isBoolean != null)
					throw new IllegalArgumentException("typed numeric assignment requires numeric operand");
				App.validateRange(a.value.toString(), pdt.unsignedOrSigned, pdt.width);
				fLocals.put(fd.signature.paramNames.get(idx),
						new Operand(a.value, pdt.unsignedOrSigned, pdt.width));
			} else {
				fLocals.put(fd.signature.paramNames.get(idx), a);
			}
		}
		return fLocals;
	}

	/**
	 * Validate and enforce declared return type.
	 */
	static Operand enforceDeclaredReturn(FunctionDef fd, Operand op, java.util.Map<String, DeclaredType> typeBindings) {
		DeclaredType declared = fd.body.returnType;
		if (declared == null)
			return op;
		if (declared.typeVarName != null) {
			if (typeBindings != null && typeBindings.containsKey(declared.typeVarName)) {
				declared = typeBindings.get(declared.typeVarName);
			} else {
				return op;
			}
		}
		if (declared.isBool) {
			if (op.isBoolean == null)
				throw new IllegalArgumentException("typed Bool return requires boolean operand");
			return op;
		}
		if (declared.isArray) {
			if (op.elements == null)
				throw new IllegalArgumentException("typed array return requires array operand");
			// resolve element type variable if present
			boolean elemIsBool = declared.elemIsBool;
			String elemUnsigned = declared.elemUnsignedOrSigned;
			String elemWidth = declared.elemWidth;
			if (declared.elemTypeVarName != null && typeBindings != null
					&& typeBindings.containsKey(declared.elemTypeVarName)) {
				DeclaredType bind = typeBindings.get(declared.elemTypeVarName);
				elemIsBool = bind.isBool;
				elemUnsigned = bind.unsignedOrSigned;
				elemWidth = bind.width;
			}
			if (declared.arrayLength != null && op.elements.size() != declared.arrayLength.intValue())
				throw new IllegalArgumentException("array initializer length mismatch");
			for (Operand el : op.elements) {
				if (elemIsBool) {
					if (el.isBoolean == null)
						throw new IllegalArgumentException("typed Bool array requires boolean elements");
					continue;
				}
				if (el.isBoolean != null)
					throw new IllegalArgumentException("typed numeric array requires numeric elements");
				if (elemUnsigned != null && elemWidth != null) {
					if (el.unsignedOrSigned != null && el.width != null) {
						if (!elemUnsigned.equals(el.unsignedOrSigned) || !elemWidth.equals(el.width))
							throw new IllegalArgumentException("mismatched typed array element assignment");
					}
					App.validateRange(el.value.toString(), elemUnsigned, elemWidth);
				}
			}
			return op;
		}
		if (declared.unsignedOrSigned != null && declared.width != null) {
			if (op.isBoolean != null)
				throw new IllegalArgumentException("typed numeric return requires numeric operand");
			App.validateRange(op.value.toString(), declared.unsignedOrSigned, declared.width);
			return new Operand(op.value, declared.unsignedOrSigned, declared.width);
		}
		return op;
	}
}
