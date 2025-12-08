package tuff;

public final class Operand {
	public final java.math.BigInteger value;
	public final String unsignedOrSigned;
	public final String width;
	public final Boolean isBoolean;
	public final java.util.List<Operand> elements; // non-null for array operands
	// metadata for array operands (when present)
	public final Integer arrayCapacity;
	public final Boolean elemIsBool;
	public final String elemUnsignedOrSigned;
	public final String elemWidth;

	public Operand(java.math.BigInteger value, String unsignedOrSigned, String width) {
		this.value = value;
		this.unsignedOrSigned = unsignedOrSigned;
		this.width = width;
		this.isBoolean = null;
		this.elements = null;
		this.arrayCapacity = null;
		this.elemIsBool = null;
		this.elemUnsignedOrSigned = null;
		this.elemWidth = null;
	}

	public Operand(java.math.BigInteger value, Boolean isBoolean) {
		this.value = value;
		this.unsignedOrSigned = null;
		this.width = null;
		this.isBoolean = isBoolean;
		this.elements = null;
		this.arrayCapacity = null;
		this.elemIsBool = null;
		this.elemUnsignedOrSigned = null;
		this.elemWidth = null;
	}

	public Operand(java.util.List<Operand> elements) {
		this(elements, (DeclaredType) null);
	}

	public Operand(java.util.List<Operand> elements, DeclaredType dt) {
		this.value = null;
		this.unsignedOrSigned = null;
		this.width = null;
		this.isBoolean = null;
		this.elements = elements;
		if (dt != null) {
			this.arrayCapacity = dt.arrayCapacity;
			this.elemIsBool = dt.elemIsBool;
			this.elemUnsignedOrSigned = dt.elemUnsignedOrSigned;
			this.elemWidth = dt.elemWidth;
		} else {
			this.arrayCapacity = null;
			this.elemIsBool = null;
			this.elemUnsignedOrSigned = null;
			this.elemWidth = null;
		}
	}

}
