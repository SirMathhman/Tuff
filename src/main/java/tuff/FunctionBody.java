package tuff;

final class FunctionBody {
	final DeclaredType returnType; // may be null
	final String bodySource; // body text including braces or single-statement

	FunctionBody(DeclaredType returnType, String bodySource) {
		this.returnType = returnType;
		this.bodySource = bodySource;
	}
}
