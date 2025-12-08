package tuff;

final class DeclaredType {
	boolean isBool;
	String unsignedOrSigned;
	String width;
	// array metadata
	boolean isArray;
	// element type for arrays
	boolean elemIsBool;
	String elemUnsignedOrSigned;
	String elemWidth;
	// array length (only support single-dimension arrays for now)
	Integer arrayLength;
	// optional array capacity when using [T; current; capacity]
	Integer arrayCapacity;
}
