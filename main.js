process.exit((() => {var _ctx = {};
const tokens = stdIn.split(/\s+/).map(t => parseInt(t, 10));
function compileTuffToJS(source) {  }
_ctx.compileTuffToJS = compileTuffToJS;
_ctx.source = _ctx.readFileSync(_ctx.fs, "./main.tuff", "utf-8");
_ctx.target = _ctx.compileTuffToJS(_ctx.source);
return 0;})());