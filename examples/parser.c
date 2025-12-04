#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>


int32_t state_start()
 {
  return
   
0  ;
}

int32_t state_identifier()
 {
  return
   
1  ;
}

int32_t state_number()
 {
  return
   
2  ;
}

int32_t state_operator()
 {
  return
   
3  ;
}

int32_t state_error()
 {
  return
   
4  ;
}

int32_t token_eof()
 {
  return
   
0  ;
}

int32_t token_identifier()
 {
  return
   
1  ;
}

int32_t token_number()
 {
  return
   
2  ;
}

int32_t token_operator()
 {
  return
   
3  ;
}

int32_t token_keyword()
 {
  return
   
4  ;
}

int32_t next_state(int32_t current, int32_t code)
 {
  if (
(current == (struct state_start) {  })  ) {
    if (
(struct is_alpha) { code }    ) {
      return
       
(struct state_identifier) {  }      ;
    }
    if (
(struct is_digit) { code }    ) {
      return
       
(struct state_number) {  }      ;
    }
    if (
(struct is_operator_start) { code }    ) {
      return
       
(struct state_operator) {  }      ;
    }
    if (
(struct is_whitespace) { code }    ) {
      return
       
(struct state_start) {  }      ;
    }
    return
     
(struct state_error) {  }    ;
  }
  return
   
(struct state_start) {  }  ;
}

bool can_continue_identifier(int32_t code)
 {
  return
   
((struct is_alphanumeric) { code } || (code == 95))  ;
}

bool can_continue_number(int32_t code)
 {
  return
   
((struct is_digit) { code } || (code == 46))  ;
}

bool is_keyword(const struct str* name)
 {
  return
   
true  ;
}

void main()
 {
  return
  ;
}

