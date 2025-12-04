#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>


bool is_whitespace(int32_t code)
 {
  return
   
((((code == 32) || (code == 9)) || (code == 10)) || (code == 13))  ;
}

bool is_digit(int32_t code)
 {
  return
   
((code >= 48) && (code <= 57))  ;
}

bool is_alpha(int32_t code)
 {
  return
   
(((code >= 97) && (code <= 122)) || ((code >= 65) && (code <= 90)))  ;
}

bool is_lower(int32_t code)
 {
  return
   
((code >= 97) && (code <= 122))  ;
}

bool is_upper(int32_t code)
 {
  return
   
((code >= 65) && (code <= 90))  ;
}

bool is_alphanumeric(int32_t c)
 {
  return
   
((struct is_alpha) { c } || (struct is_digit) { c })  ;
}

int32_t digit_to_value(int32_t digit)
 {
  return
   
(digit - 48)  ;
}

bool is_hex_digit(int32_t c)
 {
  return
   
(((struct is_digit) { c } || ((c >= 97) && (c <= 102))) || ((c >= 65) && (c <= 70)))  ;
}

bool is_operator_start(int32_t c)
 {
  return
   
(((((c == 43) || (c == 45)) || (c == 42)) || (c == 47)) || (c == 37))  ;
}

bool is_comparison_op(int32_t c)
 {
  return
   
((((c == 60) || (c == 62)) || (c == 33)) || (c == 61))  ;
}

void main()
 {
  return
  ;
}

