#include "codegen_cpp.h"
#include <sstream>

// ============================================================================
// TYPED CODE GENERATION - Uses std::visit for pattern matching
// ============================================================================
// This file contains the typed AST code generation methods.
// They use std::visit to dispatch on ast::Expr and ast::Stmt variants.
// ============================================================================

std::string CodeGeneratorCPP::genExpr(ast::ExprPtr expr)
{
	if (!expr)
		return "";

	return std::visit(ast::Overload{[this](const ast::Literal &e) -> std::string
																	{
																		// Check if this is a string literal
																		if (e.inferredType == "string")
																		{
																			// String literal: generate as C string with proper escaping
																			std::stringstream ss;
																			ss << "\"";
																			for (char c : e.value)
																			{
																				if (c == '\n')
																					ss << "\\n";
																				else if (c == '\r')
																					ss << "\\r";
																				else if (c == '\t')
																					ss << "\\t";
																				else if (c == '\\')
																					ss << "\\\\";
																				else if (c == '"')
																					ss << "\\\"";
																				else
																					ss << c;
																			}
																			ss << "\"";
																			return ss.str();
																		}

																		// Strip type suffix from numeric literals (e.g., "10I32" -> "10")
																		std::string literal = e.value;
																		std::string result;
																		for (char c : literal)
																		{
																			if ((c >= '0' && c <= '9') || c == '.' || c == '-')
																				result += c;
																			else
																				break;
																		}
																		return result.empty() ? literal : result;
																	},

																	[this](const ast::Identifier &e) -> std::string
																	{
																		// Note: generic args are NOT emitted here - they're handled at CALL_EXPR level
																		std::string name = escapeCppKeyword(e.name);

																		// Replace :: with _ for impl method calls (Counter::new -> Counter_new)
																		// Only do this if the prefix is a struct name (starts with uppercase)
																		// OR if it is the special 'string' type
																		size_t colonPos = name.find("::");
																		if (colonPos != std::string::npos && colonPos > 0)
																		{
																			char firstChar = name[0];
																			std::string prefix = name.substr(0, colonPos);
																			if ((firstChar >= 'A' && firstChar <= 'Z') || prefix == "string")
																			{
																				// This looks like an impl method (StructName::method)
																				name.replace(colonPos, 2, "_");
																			}
																		}

																		return name;
																	},

																	[this](const ast::BinaryOp &e) -> std::string
																	{
																		return genExpr(e.left) + " " + e.op + " " + genExpr(e.right);
																	},

																	[this](const ast::UnaryOp &e) -> std::string
																	{
																		return "(" + e.op + genExpr(e.operand) + ")";
																	},

																	[this](const ast::Reference &e) -> std::string
																	{
																		// Check if this is a function reference (type starts with |)
																		if (!e.inferredType.empty() && e.inferredType[0] == '|')
																		{
																			// Function pointer - just output the function name
																			// (C++ automatically converts function to pointer)
																			return genExpr(e.operand);
																		}
																		return "&" + genExpr(e.operand);
																	},

																	[this](const ast::Deref &e) -> std::string
																	{
																		return "(*" + genExpr(e.operand) + ")";
																	},

																	[this](const ast::FieldAccess &e) -> std::string
																	{
																		auto object = genExpr(e.object);
																		// If accessing field on a narrowed union, unwrap it directly
																		if (e.isNarrowedUnion)
																		{
																			// Get the narrowed type (e.g., Some<I32>)
																			std::string narrowedType = e.objectInferredType;
																			// Extract base name (e.g., "Some" from "Some<I32>")
																			std::string baseName = narrowedType;
																			size_t pos = baseName.find('<');
																			if (pos != std::string::npos)
																			{
																				baseName = baseName.substr(0, pos);
																			}
																			return object + ".__val_" + baseName + "." + e.fieldName;
																		}
																		// Handle pointer access ->
																		if (e.objectInferredType.length() > 0 && e.objectInferredType[0] == '*')
																		{
																			return object + "->" + e.fieldName;
																		}
																		return object + "." + e.fieldName;
																	},

																	[this](const ast::Index &e) -> std::string
																	{
																		return genExpr(e.object) + "[" + genExpr(e.index) + "]";
																	},

																	[this](const ast::Call &e) -> std::string
																	{
																		std::stringstream ss;
																		ss << genExpr(e.callee);

																		// Emit generic args if callee is an identifier and not extern
																		if (auto *id = std::get_if<ast::Identifier>(&*e.callee))
																		{
																			if (!e.calleeIsExtern && !id->genericArgs.empty())
																			{
																				ss << "<";
																				for (size_t i = 0; i < id->genericArgs.size(); i++)
																				{
																					if (i > 0)
																						ss << ", ";
																					ss << mapType(id->genericArgs[i]);
																				}
																				ss << ">";
																			}
																		}

																		ss << "(";
																		for (size_t i = 0; i < e.args.size(); i++)
																		{
																			if (i > 0)
																				ss << ", ";
																			// Check if argument is an array literal with string type
																			// If so, use compound literal so it can be passed to functions
																			if (std::holds_alternative<ast::ArrayLiteral>(*e.args[i]))
																			{
																				const auto &arrLit = std::get<ast::ArrayLiteral>(*e.args[i]);
																				bool isString = arrLit.inferredType == "string" ||
																												arrLit.inferredType.find("[U8;") == 0;
																				if (isString)
																				{
																					ss << "(const uint8_t[]){";
																					for (size_t j = 0; j < arrLit.elements.size(); j++)
																					{
																						if (j > 0)
																							ss << ", ";
																						ss << genExpr(arrLit.elements[j]);
																					}
																					ss << "}";
																					continue;
																				}
																			}
																			ss << genExpr(e.args[i]);
																		}
																		ss << ")";
																		return ss.str();
																	},

																	[this](const ast::StructLiteral &e) -> std::string
																	{
																		std::stringstream ss;
																		ss << e.typeName;
																		if (!e.genericArgs.empty())
																		{
																			ss << "<";
																			for (size_t i = 0; i < e.genericArgs.size(); i++)
																			{
																				if (i > 0)
																					ss << ", ";
																				ss << mapType(e.genericArgs[i]);
																			}
																			ss << ">";
																		}
																		ss << "{ ";
																		for (size_t i = 0; i < e.fields.size(); i++)
																		{
																			if (i > 0)
																				ss << ", ";
																			ss << genExpr(e.fields[i]);
																		}
																		ss << " }";
																		return ss.str();
																	},

																	[this](const ast::ArrayLiteral &e) -> std::string
																	{
																		std::stringstream ss;
																		ss << "{";
																		for (size_t i = 0; i < e.elements.size(); i++)
																		{
																			if (i > 0)
																				ss << ", ";
																			ss << genExpr(e.elements[i]);
																		}
																		ss << "}";
																		return ss.str();
																	},

																	[this](const ast::If &e) -> std::string
																	{
																		std::stringstream ss;
																		ss << "(" << genExpr(e.condition) << " ? ";
																		ss << genExpr(e.thenBranch) << " : ";
																		ss << genExpr(e.elseBranch) << ")";
																		return ss.str();
																	},

																	[this](const ast::Match &e) -> std::string
																	{
																		// Simplified - full match requires more context
																		std::stringstream ss;
																		ss << "/* match */ (";
																		for (size_t i = 0; i < e.arms.size(); i++)
																		{
																			if (i > 0)
																				ss << " : ";
																			ss << genExpr(e.arms[i].body);
																		}
																		ss << ")";
																		return ss.str();
																	},

																	[this](const ast::Is &e) -> std::string
																	{
																		// is operator: expr is Type → (expr.__tag == Tag_*::Type)
																		auto exprCode = genExpr(e.value);
																		// Expand type aliases: Option<I32> -> Some<I32>|None<I32>
																		std::string unionType = expandTypeAlias(e.valueInferredType);
																		std::string tagName = getUnionTagName(unionType);

																		// Extract base name from target type (e.g., "Some" from "Some<I32>")
																		std::string baseName = e.targetTypeStr;
																		size_t pos = baseName.find('<');
																		if (pos != std::string::npos)
																		{
																			baseName = baseName.substr(0, pos);
																		}

																		return "(" + exprCode + ".__tag == " + tagName + "::" + baseName + ")";
																	},

																	[this](const ast::SizeOf &e) -> std::string
																	{
																		return "sizeof(" + mapType(e.typeStr) + ")";
																	},

																	[this](const ast::Cast &e) -> std::string
																	{
																		return "((" + genType(e.targetType) + ")" + genExpr(e.operand) + ")";
																	},

																	[this](const ast::Block &e) -> std::string
																	{
																		std::stringstream ss;
																		ss << "{\n";
																		for (const auto &stmt : e.statements)
																		{
																			ss << "  " << genStmt(stmt) << "\n";
																		}
																		if (e.resultExpr)
																		{
																			ss << "  return " << genExpr(e.resultExpr) << ";\n";
																		}
																		ss << "}";
																		return ss.str();
																	},

																	[this](const ast::EnumValue &e) -> std::string
																	{
																		return e.enumName + "::" + e.variant;
																	}},
										*expr);
}

std::string CodeGeneratorCPP::genType(ast::TypePtr type)
{
	if (!type)
		return "auto";

	return std::visit(ast::Overload{[this](const ast::PrimitiveType &t) -> std::string
																	{
																		// Map Tuff primitives to C++ types
																		if (t.name == "I8")
																			return "int8_t";
																		if (t.name == "I16")
																			return "int16_t";
																		if (t.name == "I32")
																			return "int32_t";
																		if (t.name == "I64")
																			return "int64_t";
																		if (t.name == "U8")
																			return "uint8_t";
																		if (t.name == "U16")
																			return "uint16_t";
																		if (t.name == "U32")
																			return "uint32_t";
																		if (t.name == "U64")
																			return "uint64_t";
																		if (t.name == "F32")
																			return "float";
																		if (t.name == "F64")
																			return "double";
																		if (t.name == "Bool")
																			return "bool";
																		if (t.name == "Void")
																			return "void";
																		if (t.name == "USize")
																			return "size_t";
																		if (t.name == "Char")
																			return "char";
																		return t.name;
																	},

																	[this](const ast::PointerType &t) -> std::string
																	{
																		// Special case: pointer to array should just be element type pointer
																		if (t.pointee && std::holds_alternative<ast::ArrayType>(*t.pointee))
																		{
																			const auto &arr = std::get<ast::ArrayType>(*t.pointee);
																			std::string elem = genType(arr.elementType);
																			if (t.isMutable)
																				return elem + "*";
																			return "const " + elem + "*";
																		}

																		std::string pointee = genType(t.pointee);
																		if (t.isMutable)
																			return pointee + "*";
																		return "const " + pointee + "*";
																	},

																	[this](const ast::ArrayType &t) -> std::string
																	{
																		std::string elem = genType(t.elementType);
																		// For now, just return element type with array suffix
																		// Full handling would need size info
																		return elem + "[]";
																	},

																	[this](const ast::NamedType &t) -> std::string
																	{
																		std::stringstream ss;
																		ss << t.name;
																		if (!t.genericArgs.empty())
																		{
																			ss << "<";
																			for (size_t i = 0; i < t.genericArgs.size(); i++)
																			{
																				if (i > 0)
																					ss << ", ";
																				ss << genType(t.genericArgs[i]);
																			}
																			ss << ">";
																		}
																		return ss.str();
																	},

																	[this](const ast::UnionType &t) -> std::string
																	{
																		// Generate union struct name
																		std::stringstream ss;
																		ss << "Union";
																		for (const auto &m : t.members)
																		{
																			ss << "_" << genType(m);
																		}
																		return ss.str();
																	},

																	[this](const ast::IntersectionType &t) -> std::string
																	{
																		// Not directly representable in C++
																		return "/* intersection */";
																	},

																	[this](const ast::FunctionType &t) -> std::string
																	{
																		std::stringstream ss;
																		ss << genType(t.returnType) << "(*)( ";
																		for (size_t i = 0; i < t.paramTypes.size(); i++)
																		{
																			if (i > 0)
																				ss << ", ";
																			ss << genType(t.paramTypes[i]);
																		}
																		ss << ")";
																		return ss.str();
																	}},
										*type);
}
