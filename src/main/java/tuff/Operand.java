package tuff;

public final class Operand {
	public final java.math.BigInteger value;
	public final String unsignedOrSigned;
	public final String width;
	public final Boolean isBoolean;
	public final java.util.List<Operand> elements; // non-null for array operands

	public Operand(java.math.BigInteger value, String unsignedOrSigned, String width) {
		this.value = value;
		this.unsignedOrSigned = unsignedOrSigned;
		this.width = width;
		this.isBoolean = null;
		this.elements = null;
	}

	public Operand(java.math.BigInteger value, Boolean isBoolean) {
		this.value = value;
		this.unsignedOrSigned = null;
		this.width = null;
		this.isBoolean = isBoolean;
		this.elements = null;
	}

	public Operand(java.util.List<Operand> elements) {
		this.value = null;
		this.unsignedOrSigned = null;
		this.width = null;
		this.isBoolean = null;
		this.elements = elements;
	}

}
