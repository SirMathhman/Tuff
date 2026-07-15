#include <stdio.h>
#include <string.h>
#include <stdbool.h>

typedef struct {
} Box;
typedef struct {
		const char * value;
} String;
typedef struct {
} Vec_String;
typedef struct {
		String name;
		Vec_String type_params;
		String fields_str;
} GenericStructTemplate;
typedef struct {
		String name;
		Vec_String type_params;
		Vec_String param_names;
		String body;
} GenericFunctionTemplate;
typedef struct {
} HashSet_String;
typedef struct {
} HashMap_String_Vec_String;
typedef struct {
} Vec_GenericStructTemplate;
typedef struct {
} Vec_GenericFunctionTemplate;
typedef struct {
		String f0;
		Vec_String f1;
		String f2;
} __Tuple_String_Vec_String_String;
typedef struct {
} Vec_Tuple_String_Vec_String_String;
typedef struct {
		Vec_String vars;
		size_t var_idx;
		Vec_String mutable_vars;
		HashSet_String declared_vars;
		HashMap_String_Vec_String var_types;
		HashMap_String_Vec_String type_aliases;
		HashMap_String_Vec_String union_types;
		HashSet_String tagged_union_vars;
		Vec_String generated_structs;
		HashSet_String defined_structs;
		Vec_GenericStructTemplate generic_structs;
		HashSet_String generated_instantiations;
		Vec_GenericFunctionTemplate generic_functions;
		HashSet_String generated_function_instantiations;
		Vec_Tuple_String_Vec_String_String generated_functions;
} CompileContext;



int main() {
	
	int array[3] = {1, 2, 3};

	 int * temp = ((int *)(&array));

	return temp[0];
}
