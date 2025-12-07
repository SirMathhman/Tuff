package tuff;

public final class Operand {
	public final java.math.BigInteger value;
	public final String unsignedOrSigned;
	public final String width;
	public final Boolean isBoolean;

	public Operand(java.math.BigInteger value, String unsignedOrSigned, String width) {
		this(value, unsignedOrSigned, width, null);
	}

	public Operand(java.math.BigInteger value, Boolean isBoolean) {
		this(value, null, null, isBoolean);
	}

	Operand(java.math.BigInteger value, String unsignedOrSigned, String width, Boolean isBoolean) {
		this.value = value;
		this.unsignedOrSigned = unsignedOrSigned;
		this.width = width;
		this.isBoolean = isBoolean;
	}
}
