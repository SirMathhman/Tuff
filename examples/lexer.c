#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>


bool is_whitespace(int32_t code)
 {
  return
   
(((code == 32) || (code == 9)) || (code == 10))  ;
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

void main()
 {
  return
  ;
}

