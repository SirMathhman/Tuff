package tuff.ast.java;

public sealed interface JavaMemberDecl extends JavaNode permits JavaFieldDecl, JavaMethodDecl {
}
