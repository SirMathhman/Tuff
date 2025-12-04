#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>


int32_t type_i32()
 {
  return
   
0  ;
}

int32_t type_bool()
 {
  return
   
1  ;
}

int32_t type_str()
 {
  return
   
2  ;
}

int32_t type_unit()
 {
  return
   
3  ;
}

int32_t type_unknown()
 {
  return
   
4  ;
}

bool is_numeric_type(int32_t ty)
 {
  return
   
(ty == (struct type_i32) {  })  ;
}

bool is_boolean_type(int32_t ty)
 {
  return
   
(ty == (struct type_bool) {  })  ;
}

bool is_unit_type(int32_t ty)
 {
  return
   
(ty == (struct type_unit) {  })  ;
}

bool can_unify_types(int32_t ty1, int32_t ty2)
 {
  if (
(ty1 == ty2)  ) {
    return
     
true    ;
  }
  if (
(ty1 == (struct type_unknown) {  })  ) {
    return
     
true    ;
  }
  if (
(ty2 == (struct type_unknown) {  })  ) {
    return
     
true    ;
  }
  return
   
false  ;
}

int32_t infer_literal_type(int32_t code)
 {
  if (
(struct is_digit) { code }  ) {
    return
     
(struct type_i32) {  }    ;
  }
  return
   
(struct type_unknown) {  }  ;
}

int32_t infer_boolean_literal(bool val)
 {
  return
   
(struct type_bool) {  }  ;
}

bool declare_variable(const struct str* name, int32_t ty)
 {
  return
   
true  ;
}

int32_t lookup_variable_type(const struct str* name)
 {
  return
   
(struct type_unknown) {  }  ;
}

bool is_compatible_return_type(int32_t actual, int32_t expected)
 {
  return
   
(struct can_unify_types) { actual, expected }  ;
}

bool is_compatible_param_type(int32_t actual, int32_t expected)
 {
  return
   
(struct can_unify_types) { actual, expected }  ;
}

void main()
 {
  return
  ;
}

