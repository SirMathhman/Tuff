// compiled by selfhost tuffc
import { vec_new, vec_len, vec_get, vec_push } from "../rt/vec.mjs";
import { scan_top_level_fn_exports } from "./export_scan.mjs";
let __tuffc_scan_cache = vec_new();
export function ScanCacheEntry(path, outSigs, privateNames, allSigs) {
return { path: path, outSigs: outSigs, privateNames: privateNames, allSigs: allSigs };
}
export function cached_scan_top_level_fn_exports(path, src) {
let i = 0;
while (i < vec_len(__tuffc_scan_cache)) {
const e = vec_get(__tuffc_scan_cache, i);
if (e.path == path) {
return [e.outSigs, e.privateNames, e.allSigs];
}
i = i + 1;
}
const ex = scan_top_level_fn_exports(src);
vec_push(__tuffc_scan_cache, ScanCacheEntry(path, ex[0], ex[1], ex[2]));
return ex;
}
