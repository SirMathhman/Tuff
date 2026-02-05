clang test.c interpret.c -o test.exe
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
./test.exe
exit $LASTEXITCODE
