package tuff;

final class ReturnException extends RuntimeException {
	final Operand value;

	ReturnException(Operand value) {
		this.value = value;
	}
}
