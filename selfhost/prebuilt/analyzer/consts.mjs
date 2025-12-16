// compiled by selfhost tuffc
export function infer_int_const(e) {
if ((e.tag === "EInt")) {
return e.value;
}
return -1;
}
