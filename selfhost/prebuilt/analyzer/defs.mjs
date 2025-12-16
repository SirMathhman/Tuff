// compiled by selfhost tuffc
export function mk_union_variant_info(name, hasPayload, payloadTyAnns) {
return ({ tag: "UnionVariantInfo", tag: "UnionVariantInfo", name: name, hasPayload: hasPayload, payloadTyAnns: payloadTyAnns });
}
export function mk_struct_def(name, fields, fieldTyAnns) {
return ({ tag: "StructDef", tag: "StructDef", name: name, deprecatedReason: "", fields: fields, fieldTyAnns: fieldTyAnns });
}
export function mk_fn_sig_def(name, deprecatedReason, typeParams, params, paramTyAnns, retTyAnn) {
return ({ tag: "FnSig", tag: "FnSig", name: name, deprecatedReason: deprecatedReason, typeParams: typeParams, params: params, paramTyAnns: paramTyAnns, retTyAnn: retTyAnn });
}
export function mk_union_def(name, typeParams, variants) {
return ({ tag: "UnionDef", tag: "UnionDef", name: name, deprecatedReason: "", typeParams: typeParams, variants: variants });
}
export function mk_binding(name, isMut, tyTag, deprecatedReason, declPos, read, written, isParam) {
return ({ tag: "Binding", tag: "Binding", name: name, isMut: isMut, tyTag: tyTag, deprecatedReason: deprecatedReason, declPos: declPos, read: read, written: written, isParam: isParam });
}
export function mk_subst(name, ty) {
return ({ tag: "TySubst", tag: "TySubst", name: name, ty: ty });
}
export function mk_narrowed_tag(name, variant) {
return ({ tag: "NarrowedTag", tag: "NarrowedTag", name: name, variant: variant });
}
