process.exit(const tokens = stdIn.split(/\s+/).map(t => parseInt(t, 10));
struct Ok<T> { value : T }
struct Err<X> { error : X }

type Result<T, X> = Ok<T> | Err<X>;
type Str = *[U8];
out fn compileTuffToJS(source : Str) : Result<Str, Str> => {
    Err("Invalid source: " + source);
}

extern type FileSystem;
extern let fs : FileSystem = extern fs;
extern fn readFileSync(this : FileSystem, sourcePath : Str, encoding : Str) : Str;
extern fn writeFileSync(this : FileSystem, targetPath : Str, data : Str, encoding : Str) : Void;
extern type Console;
extern let console : Console;
extern fn error(this : Console, message : Str) : Void;
let source = fs.readFileSync("./main.tuff", "utf-8");
let target = compileTuffToJS(source);
if (target is Err { error : e }) {
    console.error(e);
return 1;
return }

fs.writeFileSync("./main.js", target.value, "utf-8"););