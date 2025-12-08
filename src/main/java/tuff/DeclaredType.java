package tuff;

final class DeclaredType {
	boolean isBool;
	String unsignedOrSigned;
	String width;
	// array metadata
	boolean isArray;
	// string type
	boolean isString;
	// element type for arrays
	boolean elemIsBool;
	String elemUnsignedOrSigned;
	String elemWidth;
	// when the array element type is a type-variable (e.g., T)
	String elemTypeVarName;
	// struct metadata
	boolean isStruct;
	java.util.Map<String, DeclaredType> structFields;
	// array length (only support single-dimension arrays for now)
	Integer arrayLength;
	// when a type is a type-variable (e.g., T) this holds its name
	String typeVarName;
	// optional array capacity when using [T; current; capacity]
	Integer arrayCapacity;
	// function type metadata
	boolean isFunction;
	java.util.List<DeclaredType> functionParamTypes;
	DeclaredType functionReturnType;
}
