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
																		// Strip type suffix from literals (e.g., "10I32" -> "10")
																		std::string literal = e.value;
																		std::string result;
																		for (char c : literal)
																		{
																			if ((c >= '0' && c <= '9') || c == '.' || c == '-')
																			{
																				result += c;
																			}
																			else
																			{
																				break;
																			}
																		}
																		return result.empty() ? literal : result;
																	},

																	[this](const ast::Identifier &e) -> std::string
																	{
																		// Note: generic args are NOT emitted here - they're handled at CALL_EXPR level
																		std::string name = escapeCppKeyword(e.name);

																		// Replace :: with _ for impl method calls (Counter::new -> Counter_new)
																		// Only do this if the prefix is a struct name (starts with uppercase)
																		size_t colonPos = name.find("::");
																		if (colonPos != std::string::npos && colonPos > 0)
																		{
																			char firstChar = name[0];
																			if (firstChar >= 'A' && firstChar <= 'Z')
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
																		return "*" + genExpr(e.operand);
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
																		ss << genExpr(e.callee) << "(";
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
																		// is operator: expr is Type → (expr.__tag == UnionStruct::Tag::Type)
																		auto exprCode = genExpr(e.value);
																		// Expand type aliases: Option<I32> -> Some<I32>|None<I32>
																		std::string unionType = expandTypeAlias(e.valueInferredType);
																		std::string structName = getUnionStructName(unionType);

																		// Add template argument from union variants
																		auto variants = splitUnionType(unionType);
																		if (!variants.empty())
																		{
																			size_t start = variants[0].find('<');
																			if (start != std::string::npos)
																			{
																				size_t end = variants[0].find('>');
																				if (end != std::string::npos)
																				{
																					std::string param = variants[0].substr(start + 1, end - start - 1);
																					structName += "<" + mapType(param) + ">";
																				}
																			}
																		}

																		// Extract base name from target type (e.g., "Some" from "Some<I32>")
																		std::string baseName = e.targetTypeStr;
																		size_t pos = baseName.find('<');
																		if (pos != std::string::npos)
																		{
																			baseName = baseName.substr(0, pos);
																		}

																		return "(" + exprCode + ".__tag == " + structName + "::Tag::" + baseName + ")";
																	},

																	[this](const ast::SizeOf &e) -> std::string
																	{
																		return "sizeof(" + mapType(e.typeStr) + ")";
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

std::string CodeGeneratorCPP::genStmt(ast::StmtPtr stmt)
{
	if (!stmt)
		return "";

	return std::visit(ast::Overload{[this](const ast::Let &s) -> std::string
																	{
																		std::stringstream ss;
																		// Use type annotation if present, otherwise auto
																		if (s.typeAnnotation)
																			ss << genType(s.typeAnnotation);
																		else
																			ss << "auto";
																		if (!s.isMutable)
																			ss << " const";
																		ss << " " << s.name;
																		if (s.initializer)
																		{
																			ss << " = " << genExpr(s.initializer);
																		}
																		ss << ";";
																		return ss.str();
																	},

																	[this](const ast::Assignment &s) -> std::string
																	{
																		return genExpr(s.target) + " = " + genExpr(s.value) + ";";
																	},

																	[this](const ast::IfStmt &s) -> std::string
																	{
																		std::stringstream ss;
																		ss << "if (" << genExpr(s.condition) << ") ";
																		ss << genExpr(s.thenBranch);
																		if (s.elseBranch)
																		{
																			ss << " else " << genExpr(s.elseBranch);
																		}
																		return ss.str();
																	},

																	[this](const ast::While &s) -> std::string
																	{
																		return "while (" + genExpr(s.condition) + ") " + genExpr(s.body);
																	},

																	[this](const ast::Loop &s) -> std::string
																	{
																		return "while (true) " + genExpr(s.body);
																	},

																	[this](const ast::Break &) -> std::string
																	{
																		return "break;";
																	},

																	[this](const ast::Continue &) -> std::string
																	{
																		return "continue;";
																	},

																	[this](const ast::Return &s) -> std::string
																	{
																		if (s.value)
																		{
																			return "return " + genExpr(s.value) + ";";
																		}
																		return "return;";
																	},

																	[this](const ast::ExprStmt &s) -> std::string
																	{
																		return genExpr(s.expr) + ";";
																	}},
										*stmt);
}

std::string CodeGeneratorCPP::genParamDecl(const ast::Parameter &param)
{
	std::string typeStr = genType(param.type);

	// Handle C++ array parameter syntax: int32_t arr[10] instead of int32_t[10] arr
	size_t bracketPos = typeStr.find('[');
	if (bracketPos != std::string::npos)
	{
		std::string baseType = typeStr.substr(0, bracketPos);
		std::string arraySuffix = typeStr.substr(bracketPos);
		return baseType + " " + param.name + arraySuffix;
	}

	return typeStr + " " + param.name;
}

std::string CodeGeneratorCPP::genFunctionBody(ast::ExprPtr body, ast::TypePtr returnType)
{
	if (!body)
		return "{}";

	// Check if body is a Block
	if (auto *block = std::get_if<ast::Block>(&*body))
	{
		std::stringstream ss;
		ss << "{\n";

		// Push new scope
		ScopeCPP newScope;
		newScope.isLoop = nextBlockIsLoop;
		nextBlockIsLoop = false;
		scopes.push_back(newScope);

		// Determine if we need implicit return
		std::string retType = genType(returnType);
		bool needsImplicitReturn = !retType.empty() && retType != "void";

		for (size_t i = 0; i < block->statements.size(); i++)
		{
			ss << "  " << genStmt(block->statements[i]) << "\n";
		}

		// Handle result expression (implicit return)
		if (block->resultExpr)
		{
			// Inject destructor calls before return
			ScopeCPP &currentScope = scopes.back();
			for (auto it = currentScope.vars.rbegin(); it != currentScope.vars.rend(); ++it)
			{
				ss << "  " << it->destructor << "(" << it->name << ");\n";
			}
			ss << "  return " << genExpr(block->resultExpr) << ";\n";
		}
		else
		{
			// No result expr - inject destructors at end
			ScopeCPP &currentScope = scopes.back();
			for (auto it = currentScope.vars.rbegin(); it != currentScope.vars.rend(); ++it)
			{
				ss << "  " << it->destructor << "(" << it->name << ");\n";
			}
		}

		scopes.pop_back();
		ss << "}";
		return ss.str();
	}

	// Single expression body - wrap in braces with return
	std::string retType = genType(returnType);
	if (retType != "void")
	{
		return "{ return " + genExpr(body) + "; }";
	}
	return "{ " + genExpr(body) + "; }";
}
