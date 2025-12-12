package tuff.transform;

import tuff.ast.SourceSpan;
import tuff.ast.java.JavaBinaryExpr;
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
import tuff.ast.tuff.TuffModule;
import tuff.ast.tuff.TuffRawDecl;
import tuff.ast.tuff.TuffUseDecl;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Java AST -> Tuff AST transformer for the current supported subset.
 */
public final class JavaToTuffTransformer {
	public TuffModule transform(JavaCompilationUnit unit) {
		List<TuffUseDecl> uses = lowerImports(unit.imports());
		List<tuff.ast.tuff.TuffDecl> decls = new ArrayList<>();

		for (JavaTypeDecl type : unit.types()) {
			if (type instanceof JavaClassDecl clazz) {
				decls.add(new TuffRawDecl(lowerClass(clazz), clazz.span()));
			}
		}

		return new TuffModule(uses, decls, unit.span());
	}

	private List<TuffUseDecl> lowerImports(List<JavaImportDecl> imports) {
		Map<List<String>, List<String>> grouped = new LinkedHashMap<>();

		for (JavaImportDecl imp : imports) {
			String qn = imp.qualifiedName();
			String[] parts = qn.split("\\.");
			if (parts.length < 2) {
				continue;
			}
			List<String> namespace = List.of(parts).subList(0, parts.length - 1);
			String name = parts[parts.length - 1];

			grouped.computeIfAbsent(namespace, _ -> new ArrayList<>()).add(name);
		}

		List<TuffUseDecl> uses = new ArrayList<>();
		for (Map.Entry<List<String>, List<String>> e : grouped.entrySet()) {
			uses.add(new TuffUseDecl(e.getKey(), e.getValue(), SourceSpan.NONE));
		}
		return uses;
	}

	private String lowerClass(JavaClassDecl clazz) {
		String nl = System.lineSeparator();
		StringBuilder sb = new StringBuilder();

		sb.append("class fn ").append(clazz.name()).append("() => {");

		for (JavaMemberDecl member : clazz.members()) {
			if (member instanceof JavaFieldDecl field) {
				sb.append(nl).append("\t").append(lowerField(field));
				continue;
			}
			if (member instanceof JavaMethodDecl method) {
				sb.append(nl).append("\t").append(lowerMethod(method));
				continue;
			}
		}

		sb.append(nl).append("}");
		return sb.toString();
	}

	private String lowerField(JavaFieldDecl field) {
		String type = lowerType(field.type());
		String expr = lowerExpr(field.init());
		return "let mut " + field.name() + " : " + type + " = " + expr + ";";
	}

	private String lowerMethod(JavaMethodDecl method) {
		String nl = System.lineSeparator();
		StringBuilder sb = new StringBuilder();

		String params = method.params().stream()
				.map(this::lowerParam)
				.reduce((a, b) -> a + ", " + b)
				.orElse("");

		sb.append("fn ").append(method.name())
				.append("(").append(params).append(")")
				.append(" : ").append(lowerType(method.returnType()))
				.append(" => {");

		for (JavaStmt stmt : method.body().stmts()) {
			if (stmt instanceof JavaReturnStmt ret) {
				sb.append(nl).append("\t\t").append("return ").append(lowerExpr(ret.value())).append(";");
			}
		}

		sb.append(nl).append("\t").append("}");
		return sb.toString();
	}

	private String lowerParam(JavaParam p) {
		return p.name() + " : " + lowerType(p.type());
	}

	private String lowerType(JavaTypeRef type) {
		if (type instanceof JavaIdentType ident) {
			return switch (ident.name()) {
				case "char", "Character" -> "U16";
				case "int" -> "I32";
				case "void" -> "Void";
				default -> ident.name();
			};
		}
		return "var";
	}

	private String lowerExpr(JavaExpr expr) {
		return switch (expr) {
			case JavaNameExpr name -> name.name();
			case JavaNumberExpr num -> num.text();
			case JavaBinaryExpr bin -> lowerExpr(bin.left()) + " " + bin.op() + " " + lowerExpr(bin.right());
		};
	}
}
