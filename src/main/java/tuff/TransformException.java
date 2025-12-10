package tuff;

public class TransformException extends CompileException {
	public TransformException(String message, TuffNode node) {
		super(message, node.display());
	}
}
