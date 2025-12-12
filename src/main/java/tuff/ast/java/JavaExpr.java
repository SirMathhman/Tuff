package tuff.ast.java;

public sealed interface JavaExpr extends JavaNode permits JavaNameExpr, JavaNumberExpr, JavaBinaryExpr {
}
