package tuff.parse.java;

import tuff.ast.SourceSpan;
import tuff.ast.java.JavaBinaryExpr;
import tuff.ast.java.JavaBlock;
import tuff.ast.java.JavaClassDecl;
import tuff.ast.java.JavaCompilationUnit;
import tuff.ast.java.JavaExpr;
import tuff.ast.java.JavaFieldDecl;
import tuff.ast.java.JavaIdentType;
import tuff.ast.java.JavaImportDecl;
import tuff.ast.java.JavaMemberDecl;
import tuff.ast.java.JavaMethodDecl;
import tuff.ast.java.JavaNameExpr;
import tuff.ast.java.JavaNumberExpr;
import tuff.ast.java.JavaParam;
import tuff.ast.java.JavaReturnStmt;
import tuff.ast.java.JavaStmt;
import tuff.ast.java.JavaTypeDecl;
import tuff.ast.java.JavaTypeRef;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Very small parser for the Java subset currently supported by the transpiler.
 *
 * Expressions are parsed left-to-right (no precedence), per project constraint.
 */
public final class JavaParser {
	private static final Set<String> BINARY_OPS = Set.of(
			"<", ">", ">=", "+", "-", "&&", "||", "==", "!=");

	public JavaCompilationUnit parse(String source) {
		List<JavaToken> tokens = new JavaLexer().lex(source);
		Cursor c = new Cursor(tokens);

		// package ...; (ignored)
		skipPackageIfPresent(c);

		List<JavaImportDecl> imports = new ArrayList<>();
		while (c.peekIsIdent("import")) {
			imports.add(parseImport(c));
		}

		List<JavaTypeDecl> types = new ArrayList<>();
		while (!c.isAtEnd()) {
			if (c.peekIsIdent("class")) {
				types.add(parseClass(c));
				continue;
			}

			// skip unexpected tokens
			c.next();
		}

		return new JavaCompilationUnit(imports, types, new SourceSpan(0, source.length()));
	}

	private void skipPackageIfPresent(Cursor c) {
		if (!c.peekIsIdent("package")) {
			return;
		}

		// consume until ';'
		while (!c.isAtEnd()) {
			JavaToken t = c.next();
			if (t.type() == JavaTokenType.SYMBOL && t.lexeme().equals(";")) {
				return;
			}
		}
	}

	private JavaImportDecl parseImport(Cursor c) {
		JavaToken start = c.expectIdent("import");

		StringBuilder qn = new StringBuilder();
		boolean first = true;
		while (!c.isAtEnd()) {
			JavaToken t = c.peek();
			if (t.type() == JavaTokenType.SYMBOL && t.lexeme().equals(";")) {
				JavaToken end = c.next();
				return new JavaImportDecl(qn.toString(), new SourceSpan(start.span().startOffset(), end.span().endOffset()));
			}

			// ignore 'static' for now
			if (t.type() == JavaTokenType.IDENT && t.lexeme().equals("static")) {
				c.next();
				continue;
			}

			if (t.type() == JavaTokenType.IDENT) {
				if (!first) {
					qn.append('.');
				}
				qn.append(t.lexeme());
				first = false;
				c.next();
				continue;
			}

			// skip dots
			if (t.type() == JavaTokenType.SYMBOL && t.lexeme().equals(".")) {
				c.next();
				continue;
			}

			// anything else is unexpected; best-effort consume
			c.next();
		}

		return new JavaImportDecl(qn.toString(), start.span());
	}

	private JavaClassDecl parseClass(Cursor c) {
		JavaToken start = c.expectIdent("class");
		JavaToken nameTok = c.expect(JavaTokenType.IDENT, "class name");
		c.expectSymbol("{");

		List<JavaMemberDecl> members = new ArrayList<>();
		while (!c.isAtEnd() && !c.peekIsSymbol("}")) {
			// simple member: <type> <name> ( field | method )
			JavaTypeRef type = parseTypeRef(c);
			JavaToken memberName = c.expect(JavaTokenType.IDENT, "member name");

			if (c.peekIsSymbol("(")) {
				members.add(parseMethodRest(type, memberName, c));
				continue;
			}

			// field
			JavaExpr init = new JavaNumberExpr("0", memberName.span());
			if (c.peekIsSymbol("=")) {
				c.next();
				init = parseExpr(c);
			}
			JavaToken end = c.expectSymbol(";");
			members.add(new JavaFieldDecl(type, memberName.lexeme(), init,
					new SourceSpan(type.span().startOffset(), end.span().endOffset())));
		}

		JavaToken end = c.expectSymbol("}");
		return new JavaClassDecl(nameTok.lexeme(), members,
				new SourceSpan(start.span().startOffset(), end.span().endOffset()));
	}

	private JavaMethodDecl parseMethodRest(JavaTypeRef returnType, JavaToken nameTok, Cursor c) {
		JavaToken lparen = c.expectSymbol("(");

		List<JavaParam> params = new ArrayList<>();
		if (!c.peekIsSymbol(")")) {
			while (true) {
				JavaTypeRef type = parseTypeRef(c);
				JavaToken name = c.expect(JavaTokenType.IDENT, "parameter name");
				params.add(
						new JavaParam(type, name.lexeme(), new SourceSpan(type.span().startOffset(), name.span().endOffset())));
				if (c.peekIsSymbol(",")) {
					c.next();
					continue;
				}
				break;
			}
		}
		c.expectSymbol(")");

		JavaBlock body = parseBlock(c);
		return new JavaMethodDecl(returnType, nameTok.lexeme(), params, body,
				new SourceSpan(returnType.span().startOffset(), body.span().endOffset()));
	}

	private JavaBlock parseBlock(Cursor c) {
		JavaToken start = c.expectSymbol("{");
		List<JavaStmt> stmts = new ArrayList<>();
		while (!c.isAtEnd() && !c.peekIsSymbol("}")) {
			if (c.peekIsIdent("return")) {
				JavaToken retTok = c.next();
				JavaExpr value = parseExpr(c);
				JavaToken end = c.expectSymbol(";");
				stmts.add(new JavaReturnStmt(value, new SourceSpan(retTok.span().startOffset(), end.span().endOffset())));
				continue;
			}

			// skip unknown statements (consume until ';' or '}' depth-0)
			consumeStatementLike(c);
		}
		JavaToken end = c.expectSymbol("}");
		return new JavaBlock(stmts, new SourceSpan(start.span().startOffset(), end.span().endOffset()));
	}

	private void consumeStatementLike(Cursor c) {
		int depth = 0;
		while (!c.isAtEnd()) {
			JavaToken t = c.next();
			if (t.type() == JavaTokenType.SYMBOL) {
				if (t.lexeme().equals("{"))
					depth++;
				if (t.lexeme().equals("}")) {
					if (depth == 0) {
						c.back();
						return;
					}
					depth--;
				}
				if (t.lexeme().equals(";") && depth == 0) {
					return;
				}
			}
		}
	}

	private JavaTypeRef parseTypeRef(Cursor c) {
		JavaToken t = c.expect(JavaTokenType.IDENT, "type");
		return new JavaIdentType(t.lexeme(), t.span());
	}

	private JavaExpr parseExpr(Cursor c) {
		JavaExpr left = parsePrimary(c);
		while (!c.isAtEnd()) {
			JavaToken t = c.peek();
			if (t.type() == JavaTokenType.SYMBOL && BINARY_OPS.contains(t.lexeme())) {
				String op = c.next().lexeme();
				JavaExpr right = parsePrimary(c);
				left = new JavaBinaryExpr(left, op, right, new SourceSpan(left.span().startOffset(), right.span().endOffset()));
				continue;
			}
			break;
		}
		return left;
	}

	private JavaExpr parsePrimary(Cursor c) {
		JavaToken t = c.peek();
		if (t.type() == JavaTokenType.NUMBER) {
			c.next();
			return new JavaNumberExpr(t.lexeme(), t.span());
		}
		if (t.type() == JavaTokenType.IDENT) {
			c.next();
			return new JavaNameExpr(t.lexeme(), t.span());
		}
		if (t.type() == JavaTokenType.SYMBOL && t.lexeme().equals("(")) {
			JavaToken start = c.next();
			JavaExpr inner = parseExpr(c);
			JavaToken end = c.expectSymbol(")");
			return inner; // keep it simple for now
		}

		// best-effort fallback
		c.next();
		return new JavaNameExpr(t.lexeme(), t.span());
	}

	private static final class Cursor {
		private final List<JavaToken> tokens;
		private int pos;

		Cursor(List<JavaToken> tokens) {
			this.tokens = tokens;
			this.pos = 0;
		}

		boolean isAtEnd() {
			return peek().type() == JavaTokenType.EOF;
		}

		JavaToken peek() {
			return tokens.get(pos);
		}

		JavaToken next() {
			return tokens.get(pos++);
		}

		void back() {
			pos = Math.max(0, pos - 1);
		}

		boolean peekIsIdent(String lexeme) {
			JavaToken t = peek();
			return t.type() == JavaTokenType.IDENT && t.lexeme().equals(lexeme);
		}

		boolean peekIsSymbol(String lexeme) {
			JavaToken t = peek();
			return t.type() == JavaTokenType.SYMBOL && t.lexeme().equals(lexeme);
		}

		JavaToken expectIdent(String lexeme) {
			JavaToken t = expect(JavaTokenType.IDENT, "'" + lexeme + "'");
			if (!t.lexeme().equals(lexeme)) {
				throw new IllegalArgumentException("Expected " + lexeme + " but got " + t.lexeme());
			}
			return t;
		}

		JavaToken expectSymbol(String lexeme) {
			JavaToken t = expect(JavaTokenType.SYMBOL, "'" + lexeme + "'");
			if (!t.lexeme().equals(lexeme)) {
				throw new IllegalArgumentException("Expected symbol " + lexeme + " but got " + t.lexeme());
			}
			return t;
		}

		JavaToken expect(JavaTokenType type, String what) {
			JavaToken t = next();
			if (t.type() != type) {
				throw new IllegalArgumentException("Expected " + what + " but got " + t.type() + "(" + t.lexeme() + ")");
			}
			return t;
		}
	}
}
